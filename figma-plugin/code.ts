figma.showUI(__html__, { width: 240, height: 280 });

// ─── Selection tracking ────────────────────────────────────────────────────────

/** Sends current selection state to the UI so the precomp button can react. */
function sendSelectionInfo() {
  const sel = figma.currentPage.selection;
  // Only count container nodes (groups, frames, instances) as precomp candidates.
  const candidates = sel.filter(n =>
    n.type === 'GROUP' || n.type === 'FRAME' ||
    n.type === 'COMPONENT' || n.type === 'INSTANCE'
  );
  const marked = candidates.filter(n => n.name.startsWith('*'));
  figma.ui.postMessage({
    type: 'selection-info',
    total:  candidates.length,
    marked: marked.length,
  });
}

// Fire on every selection change so the UI button stays in sync.
figma.on('selectionchange', sendSelectionInfo);
// Also send the initial state as soon as the plugin opens.
sendSelectionInfo();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMaskLayer(node: SceneNode): boolean {
  return 'isMask' in node && (node as any).isMask === true;
}

/** Geometry bounds (absoluteBoundingBox). Used for positions and comp sizes. */
function getGeomBox(node: SceneNode): { x: number; y: number; w: number; h: number } | null {
  const box = node.absoluteBoundingBox;
  if (!box) return null;
  return { x: box.x, y: box.y, w: box.width, h: box.height };
}

type Box = { x: number; y: number; w: number; h: number };

/** Returns render bounds, falling back to geometry. */
function getRenderBox(node: SceneNode): Box | null {
  const r = (node as any).absoluteRenderBounds as
    | { x: number; y: number; width: number; height: number } | null | undefined;
  if (r && r.width > 0 && r.height > 0) return { x: r.x, y: r.y, w: r.width, h: r.height };
  return getGeomBox(node);
}

/** True if the node has any visible blur or drop-shadow effect. */
function hasOverflowEffect(node: SceneNode): boolean {
  const effects = (node as any).effects as any[] | undefined;
  if (!Array.isArray(effects)) return false;
  return effects.some((e) =>
    e.visible !== false &&
    (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR' ||
     e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW')
  );
}

/**
 * Exports a node as a PNG and returns bytes + bounding box.
 * exportScale: 1 = 1x fast (AE 100%), 2 = 2x sharp (AE 50%).
 */
async function exportNodeFull(
  node: SceneNode,
  exportScale: 1 | 2 = 1,
): Promise<{ bytes: Uint8Array; box: Box } | null> {
  const geom = getGeomBox(node);
  if (!geom) return null;

  if (!hasOverflowEffect(node)) {
    try {
      const bytes = await node.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: exportScale },
        useAbsoluteBounds: true,
      });
      return { bytes, box: geom };
    } catch (e) {
      console.error('Export failed for', node.name, e);
      return null;
    }
  }

  // Has blur/shadow: disable clipsContent on all ancestor frames so that
  // absoluteRenderBounds (and the export) are not clipped by the parent frame.
  type ClipParent = FrameNode | ComponentNode | InstanceNode;
  const clipped: ClipParent[] = [];
  let cur: BaseNode | null = node.parent;
  while (cur) {
    if ('clipsContent' in cur && (cur as any).clipsContent === true) {
      clipped.push(cur as ClipParent);
      (cur as any).clipsContent = false;
    }
    cur = cur.parent;
  }

  try {
    // absoluteRenderBounds now reflects the full unclipped render area.
    const renderBox = getRenderBox(node) ?? geom;
    const bytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: exportScale },
      // No useAbsoluteBounds → Figma exports at render bounds (full blur).
    });
    return { bytes, box: renderBox };
  } catch (e) {
    console.error('Export failed for', node.name, e);
    return null;
  } finally {
    // Always restore clipsContent — even if export threw.
    for (const p of clipped) (p as any).clipsContent = true;
  }
}

/**
 * True when a node (and all its descendants) are pure vector/shape primitives.
 * These are flattened into a single PNG — no benefit separating 200 tiny paths.
 */
function isPureVector(node: SceneNode): boolean {
  switch (node.type) {
    case 'VECTOR': case 'LINE': case 'ELLIPSE':
    case 'POLYGON': case 'STAR': case 'BOOLEAN_OPERATION':
      return true;
    case 'RECTANGLE': {
      const f = (node as RectangleNode).fills;
      return !(Array.isArray(f) && f.some((x: any) => x.type === 'IMAGE'));
    }
    case 'TEXT': return false;
    case 'GROUP': case 'FRAME': case 'COMPONENT': case 'INSTANCE':
      if (!('children' in node)) return true;
      return ((node as any).children as SceneNode[]).every(isPureVector);
    default: return false;
  }
}

// ─── Output types ─────────────────────────────────────────────────────────────

interface LayerData {
  name: string;
  pngBase64: string;
  /** Top-left of the node's geometry relative to the group/frame origin. */
  relX: number;
  relY: number;
  /** Geometry width/height — matches the exported PNG at 1x (PNG is 2x). */
  width: number;
  height: number;
  opacity: number;
  blendMode: string;
  /** AE label color (0=none, 1-16). All layers of the same top-level Figma
   *  group share the same color so they're visually grouped in AE. */
  labelColor: number;
}

interface GroupExport {
  name: string;
  groupWidth: number;
  groupHeight: number;
  absoluteX: number;
  absoluteY: number;
  /** 1 = 1x export (AE scale 100%), 2 = 2x export (AE scale 50%) */
  exportScale: 1 | 2;
  layers: LayerData[];
}

// ─── Recursive flat layer collector ───────────────────────────────────────────

/**
 * Collects exportable layers recursively into `out`.
 *
 * PERF: at each level we bucket nodes into:
 *   • non-blur leaves     → exported in parallel with Promise.all
 *   • blur/shadow leaves  → exported sequentially (clipsContent toggle can't race)
 *   • pure-vector groups  → treated as non-blur leaf (export whole group)
 *   • complex containers  → recursed (blocks flush; must stay in sequence)
 *
 * Slot-based ordering: each node gets a reserved slot in a temp array so
 * parallel exports don't scramble the AE layer order.
 */
async function collectLayers(
  nodes: readonly SceneNode[],
  originX: number,
  originY: number,
  parentOpacity: number,
  out: LayerData[],
  labelColor: number,
  colorCounter: { n: number },
  exportScale: 1 | 2,
): Promise<void> {
  // Pre-filter: skip invisible / mask nodes early.
  const visible = (nodes as SceneNode[]).filter(
    n => n.visible && !isMaskLayer(n) && getGeomBox(n) !== null,
  );

  // ── Categorise nodes ─────────────────────────────────────────────────────
  interface PendingNormal {
    slot: number;
    promise: Promise<{ bytes: Uint8Array; box: Box } | null>;
    meta: { name: string; geom: Box; totalOpacity: number; blendMode: string; labelColor: number };
  }

  // slots[] holds final LayerData in original node order.
  // We allocate all slots upfront so parallel fills land in the right places.
  // Complex containers get -1 (they recurse synchronously and push directly).
  const slots: (LayerData | null | 'recurse')[] = new Array(visible.length).fill(null);
  const normalPending: PendingNormal[] = [];
  const blurNodes: { slot: number; node: SceneNode;
    meta: { name: string; geom: Box; totalOpacity: number; blendMode: string; labelColor: number } }[] = [];

  for (let i = 0; i < visible.length; i++) {
    const node = visible[i];
    const geom         = getGeomBox(node)!;
    const nodeOpacity  = 'opacity'  in node ? (node as any).opacity  as number : 1;
    const totalOpacity = parentOpacity * nodeOpacity;
    const blendMode    = ('blendMode' in node ? (node as any).blendMode : 'NORMAL') as string;

    const isContainer = (
      node.type === 'GROUP' || node.type === 'FRAME' ||
      node.type === 'COMPONENT' || node.type === 'INSTANCE'
    ) && 'children' in node;

    if (isContainer && !isPureVector(node)) {
      // Complex container — must recurse; mark slot for later.
      slots[i] = 'recurse';
      continue;
    }

    // Leaf or pure-vector group → export as PNG.
    const meta = { name: node.name, geom, totalOpacity, blendMode, labelColor };

    if (hasOverflowEffect(node)) {
      blurNodes.push({ slot: i, node, meta });
    } else {
      normalPending.push({ slot: i, promise: exportNodeFull(node, exportScale), meta });
    }
  }

  // ── Parallel non-blur exports ─────────────────────────────────────────────
  const normalResults = await Promise.all(normalPending.map(p => p.promise));
  for (let i = 0; i < normalPending.length; i++) {
    const { slot, meta } = normalPending[i];
    const result = normalResults[i];
    if (!result) continue;
    slots[slot] = {
      name:       meta.name,
      pngBase64:  figma.base64Encode(result.bytes),
      relX:       result.box.x - originX,
      relY:       result.box.y - originY,
      width:      result.box.w,
      height:     result.box.h,
      opacity:    meta.totalOpacity,
      blendMode:  meta.blendMode,
      labelColor: meta.labelColor,
    };
  }

  // ── Sequential blur exports ───────────────────────────────────────────────
  for (const { slot, node, meta } of blurNodes) {
    const result = await exportNodeFull(node, exportScale);
    if (!result) continue;
    slots[slot] = {
      name:       meta.name,
      pngBase64:  figma.base64Encode(result.bytes),
      relX:       result.box.x - originX,
      relY:       result.box.y - originY,
      width:      result.box.w,
      height:     result.box.h,
      opacity:    meta.totalOpacity,
      blendMode:  meta.blendMode,
      labelColor: meta.labelColor,
    };
  }

  // ── Recurse into complex containers + flush results in original order ─────
  for (let i = 0; i < visible.length; i++) {
    const slot = slots[i];
    if (slot === 'recurse') {
      const node = visible[i];
      const nodeOpacity  = 'opacity' in node ? (node as any).opacity as number : 1;
      const totalOpacity = parentOpacity * nodeOpacity;
      let thisGroupColor = labelColor;
      if (labelColor === 0) {
        thisGroupColor = (colorCounter.n % 16) + 1;
        colorCounter.n++;
      }
      await collectLayers(
        (node as any).children,
        originX, originY,
        totalOpacity,
        out,
        thisGroupColor,
        colorCounter,
        exportScale,
      );
    } else if (slot !== null) {
      out.push(slot);
    }
  }
}

// ─── Top-level export ─────────────────────────────────────────────────────────

async function exportGroup(group: SceneNode, exportScale: 1 | 2 = 1): Promise<GroupExport | null> {
  const geom = getGeomBox(group);
  if (!geom) return null;

  const layers: LayerData[] = [];

  // Frame / Component background fills
  if (
    group.type === 'FRAME'    ||
    group.type === 'COMPONENT'||
    group.type === 'INSTANCE'
  ) {
    const f = group as FrameNode;
    const hasFills   = Array.isArray(f.fills)   && f.fills.some((x: any)  => x.visible !== false);
    const hasStrokes = Array.isArray(f.strokes)  && f.strokes.some((x: any) => x.visible !== false);
    const hasEffects = Array.isArray(f.effects)  && f.effects.some((x: any) => x.visible !== false);

    if (hasFills || hasStrokes || hasEffects) {
      try {
        const tmp = figma.createRectangle();
        tmp.resize(Math.max(geom.w, 1), Math.max(geom.h, 1));
        if (hasFills)   tmp.fills   = f.fills   as Paint[];
        if (hasStrokes) { tmp.strokes = f.strokes as Paint[]; tmp.strokeWeight = f.strokeWeight as number; }
        if (hasEffects) tmp.effects = f.effects  as Effect[];
        if (f.cornerRadius !== figma.mixed) tmp.cornerRadius = f.cornerRadius;

        const bytes = await tmp.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: exportScale } });
        tmp.remove();

        layers.push({
          name: group.name + ' Background',
          pngBase64: figma.base64Encode(bytes),
          relX: 0, relY: 0,
          width: geom.w, height: geom.h,
          opacity: 1, blendMode: 'NORMAL',
          labelColor: 0,
        });
      } catch (e) {
        console.error('Failed to export frame background', e);
      }
    }
  }

  const frameChildren: readonly SceneNode[] = 'children' in group
    ? (group as any).children
    : [group];

  const colorCounter = { n: 0 };
  await collectLayers(frameChildren, geom.x, geom.y, 1, layers, 0, colorCounter, exportScale);

  return {
    name: group.name,
    groupWidth: geom.w,
    groupHeight: geom.h,
    absoluteX: geom.x,
    absoluteY: geom.y,
    exportScale,
    layers,
  };
}

// ─── Message handler ──────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg) => {

  // ── Mark / unmark selected groups as precomp ─────────────────────────────
  if (msg.type === 'mark-precomp') {
    const candidates = figma.currentPage.selection.filter(n =>
      n.type === 'GROUP' || n.type === 'FRAME' ||
      n.type === 'COMPONENT' || n.type === 'INSTANCE'
    );
    if (candidates.length === 0) {
      figma.notify('⚠️ Select at least one group or frame.');
      return;
    }
    // If ALL are already marked → remove * (toggle off).
    // Otherwise → add * to any that don't have it (toggle on).
    const allMarked = candidates.every(n => n.name.startsWith('*'));
    for (const node of candidates) {
      if (allMarked) {
        // Remove the leading *.
        node.name = node.name.replace(/^\*+/, '');
      } else if (!node.name.startsWith('*')) {
        node.name = '*' + node.name;
      }
    }
    // Refresh the UI button state after renaming.
    sendSelectionInfo();
    figma.notify(
      allMarked
        ? `★ Removed precomp mark from ${candidates.length} layer(s)`
        : `★ Marked ${candidates.length} layer(s) as precomp`,
    );
    return;
  }

  // ── Export selection to Companion ────────────────────────────────────────
  if (msg.type !== 'export-selection') return;

  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify('⚠️ Select at least one group or frame first.');
    figma.ui.postMessage({ type: 'export-error', message: 'No selection' });
    return;
  }

  // Read scale preference from UI (1 or 2, default 1).
  const exportScale: 1 | 2 = msg.scale === 2 ? 2 : 1;

  figma.ui.postMessage({
    type: 'export-start',
    total: selection.length,
    documentName: figma.root.name,
  });

  for (const node of selection) {
    figma.ui.postMessage({
      type: 'export-progress',
      message: `Exporting "${node.name}"…`,
    });

    try {
      const result = await exportGroup(node, exportScale);
      if (result) {
        figma.ui.postMessage({ type: 'export-group', group: result });
      }
    } catch (err) {
      console.error('Failed to export', node.name, err);
      figma.notify('❌ Error exporting ' + node.name + ': ' + err);
    }
  }

  figma.ui.postMessage({ type: 'export-done' });
};
