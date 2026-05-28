figma.showUI(__html__, { width: 320, height: 500 });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMaskLayer(node: SceneNode): boolean {
  return 'isMask' in node && (node as any).isMask === true;
}

/** Pure geometry bounds — no effects. Used for group origin calculations. */
function getGeomBox(node: SceneNode): { x: number; y: number; w: number; h: number } | null {
  const box = node.absoluteBoundingBox;
  if (!box) return null;
  return { x: box.x, y: box.y, w: box.width, h: box.height };
}

/**
 * Rendered bounds including blur/shadow overflow.
 * Used for image sizes and positions so blurred layers aren't clipped.
 * Falls back to geometry bounds if render bounds are unavailable.
 */
function getRenderBox(node: SceneNode): { x: number; y: number; w: number; h: number } | null {
  const r = (node as any).absoluteRenderBounds as
    | { x: number; y: number; width: number; height: number }
    | null | undefined;
  if (r && r.width > 0 && r.height > 0) {
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }
  return getGeomBox(node);
}

async function exportPNG(node: SceneNode): Promise<Uint8Array | null> {
  try {
    // No useAbsoluteBounds — Figma exports the full render area (incl. blur/shadow).
    // getRenderBox() gives matching coords so positions stay correct in AE.
    return await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2 }, // 2x retina; AE layer set to 50%
    });
  } catch (e) {
    console.error('Export failed for', node.name, e);
    return null;
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
  relX: number;
  relY: number;
  width: number;
  height: number;
  opacity: number;
  blendMode: string;
  /** AE label color index (0 = none, 1-16 = AE colors). All layers from the
   *  same Figma group share the same color so they're visually grouped in AE. */
  labelColor: number;
}

interface GroupExport {
  name: string;
  groupWidth: number;
  groupHeight: number;
  absoluteX: number;
  absoluteY: number;
  layers: LayerData[];
}

// ─── Recursive flat layer collector ───────────────────────────────────────────

/**
 * @param labelColor   AE label color index for the current group (0 = none).
 * @param colorCounter Shared counter — incremented each time we enter a new group.
 */
async function collectLayers(
  nodes: readonly SceneNode[],
  originX: number,
  originY: number,
  parentOpacity: number,
  out: LayerData[],
  labelColor: number,
  colorCounter: { n: number },
): Promise<void> {
  // Figma children[0] = bottommost, children[n-1] = topmost.
  // AE layers.add() always inserts at index 1 (top), pushing others down.
  // Iterating bottom→top means the last item added (Figma top) stays at AE index 1. ✓
  for (const node of nodes) {
    if (!node.visible) continue;
    if (isMaskLayer(node)) continue;

    const geom   = getGeomBox(node);
    const render = getRenderBox(node);
    if (!geom || !render) continue;

    const nodeOpacity  = 'opacity'   in node ? (node as any).opacity   as number : 1;
    const totalOpacity = parentOpacity * nodeOpacity;
    const blendMode    = ('blendMode' in node ? (node as any).blendMode : 'NORMAL') as string;

    const isContainer = (
      node.type === 'GROUP'    ||
      node.type === 'FRAME'    ||
      node.type === 'COMPONENT'||
      node.type === 'INSTANCE'
    ) && 'children' in node;

    if (isContainer) {
      if (isPureVector(node)) {
        // ── Flatten decorative shape groups → 1 PNG ──────────────────────────
        const bytes = await exportPNG(node);
        if (!bytes) continue;
        out.push({
          name: node.name,
          pngBase64: figma.base64Encode(bytes),
          relX: render.x - originX,
          relY: render.y - originY,
          width: render.w,
          height: render.h,
          opacity: totalOpacity,
          blendMode,
          labelColor,
        });
      } else {
        // ── Recurse — only assign a NEW color at the outermost group level ────
        // Sub-groups inherit the parent group's color so every layer that
        // belongs to the same visual unit shares ONE color swatch in AE.
        let thisGroupColor = labelColor;
        if (labelColor === 0) {
          thisGroupColor = (colorCounter.n % 16) + 1; // cycles 1-16
          colorCounter.n++;
        }
        await collectLayers(
          (node as any).children,
          originX, originY,
          totalOpacity,
          out,
          thisGroupColor,
          colorCounter,
        );
      }
      continue;
    }

    // ── Leaf node → export as image ───────────────────────────────────────────
    const bytes = await exportPNG(node);
    if (!bytes) continue;
    out.push({
      name: node.name,
      pngBase64: figma.base64Encode(bytes),
      relX: render.x - originX,
      relY: render.y - originY,
      width: render.w,
      height: render.h,
      opacity: totalOpacity,
      blendMode,
      labelColor,
    });
  }
}

// ─── Top-level export ─────────────────────────────────────────────────────────

async function exportGroup(group: SceneNode): Promise<GroupExport | null> {
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

        const bytes = await tmp.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
        tmp.remove();

        layers.push({
          name: group.name + ' Background',
          pngBase64: figma.base64Encode(bytes),
          relX: 0, relY: 0,
          width: geom.w, height: geom.h,
          opacity: 1,
          blendMode: 'NORMAL',
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
  await collectLayers(frameChildren, geom.x, geom.y, 1, layers, 0, colorCounter);

  return {
    name: group.name,
    groupWidth: geom.w,
    groupHeight: geom.h,
    absoluteX: geom.x,
    absoluteY: geom.y,
    layers,
  };
}

// ─── Message handler ──────────────────────────────────────────────────────────

figma.ui.onmessage = async (msg) => {
  if (msg.type !== 'export-selection') return;

  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify('⚠️ Select at least one group or frame first.');
    figma.ui.postMessage({ type: 'export-error', message: 'No selection' });
    return;
  }

  figma.ui.postMessage({ type: 'export-progress', message: 'Exporting layers…' });

  try {
    const exports: GroupExport[] = [];
    for (const node of selection) {
      const result = await exportGroup(node);
      if (result) exports.push(result);
    }

    figma.ui.postMessage({
      type: 'send-to-server',
      payload: exports,
      documentName: figma.root.name,
    });
  } catch (err) {
    console.error(err);
    figma.notify('❌ Export error: ' + err);
    figma.ui.postMessage({ type: 'export-error', message: String(err) });
  }
};
