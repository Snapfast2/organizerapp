"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
figma.showUI(__html__, { width: 320, height: 500 });
// ─── Helpers ──────────────────────────────────────────────────────────────────
function isMaskLayer(node) {
    return 'isMask' in node && node.isMask === true;
}
/** Geometry bounds (absoluteBoundingBox). Used for positions and comp sizes. */
function getGeomBox(node) {
    const box = node.absoluteBoundingBox;
    if (!box)
        return null;
    return { x: box.x, y: box.y, w: box.width, h: box.height };
}
/** Returns render bounds, falling back to geometry. */
function getRenderBox(node) {
    const r = node.absoluteRenderBounds;
    if (r && r.width > 0 && r.height > 0)
        return { x: r.x, y: r.y, w: r.width, h: r.height };
    return getGeomBox(node);
}
/** True if the node has any visible blur or drop-shadow effect. */
function hasOverflowEffect(node) {
    const effects = node.effects;
    if (!Array.isArray(effects))
        return false;
    return effects.some((e) => e.visible !== false &&
        (e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR' ||
            e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW'));
}
/**
 * Exports a node as a 2x PNG and returns the PNG bytes + the bounding box
 * that corresponds to those pixels (for correct positioning in AE).
 *
 * Strategy:
 *  - Normal nodes  → useAbsoluteBounds:true  (geometry bounds, no parent clip)
 *  - Blur/shadow   → temporarily disable clipsContent on all ancestor frames,
 *                    export at full render bounds (captures the glow/blur
 *                    overflow), then restore clipsContent.
 *
 * This handles both:
 *   1. Assets that overflow the parent frame (fixed by useAbsoluteBounds)
 *   2. Blur/glow effects that extend beyond geometry (fixed by clip-disable)
 */
function exportNodeFull(node) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const geom = getGeomBox(node);
        if (!geom)
            return null;
        if (!hasOverflowEffect(node)) {
            // No blur/shadow — export at geometry bounds, safe from parent clipping.
            try {
                const bytes = yield node.exportAsync({
                    format: 'PNG',
                    constraint: { type: 'SCALE', value: 1 }, // 1x: 4× faster, AE uses Scale 100%
                    useAbsoluteBounds: true,
                });
                return { bytes, box: geom };
            }
            catch (e) {
                console.error('Export failed for', node.name, e);
                return null;
            }
        }
        const clipped = [];
        let cur = node.parent;
        while (cur) {
            if ('clipsContent' in cur && cur.clipsContent === true) {
                clipped.push(cur);
                cur.clipsContent = false;
            }
            cur = cur.parent;
        }
        try {
            // absoluteRenderBounds now reflects the full unclipped render area.
            const renderBox = (_a = getRenderBox(node)) !== null && _a !== void 0 ? _a : geom;
            const bytes = yield node.exportAsync({
                format: 'PNG',
                constraint: { type: 'SCALE', value: 1 }, // 1x: 4× faster, AE uses Scale 100%
                // No useAbsoluteBounds → Figma exports at render bounds (full blur).
            });
            return { bytes, box: renderBox };
        }
        catch (e) {
            console.error('Export failed for', node.name, e);
            return null;
        }
        finally {
            // Always restore clipsContent — even if export threw.
            for (const p of clipped)
                p.clipsContent = true;
        }
    });
}
/**
 * True when a node (and all its descendants) are pure vector/shape primitives.
 * These are flattened into a single PNG — no benefit separating 200 tiny paths.
 */
function isPureVector(node) {
    switch (node.type) {
        case 'VECTOR':
        case 'LINE':
        case 'ELLIPSE':
        case 'POLYGON':
        case 'STAR':
        case 'BOOLEAN_OPERATION':
            return true;
        case 'RECTANGLE': {
            const f = node.fills;
            return !(Array.isArray(f) && f.some((x) => x.type === 'IMAGE'));
        }
        case 'TEXT': return false;
        case 'GROUP':
        case 'FRAME':
        case 'COMPONENT':
        case 'INSTANCE':
            if (!('children' in node))
                return true;
            return node.children.every(isPureVector);
        default: return false;
    }
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
function collectLayers(nodes, originX, originY, parentOpacity, out, labelColor, colorCounter) {
    return __awaiter(this, void 0, void 0, function* () {
        // Pre-filter: skip invisible / mask nodes early.
        const visible = nodes.filter(n => n.visible && !isMaskLayer(n) && getGeomBox(n) !== null);
        // slots[] holds final LayerData in original node order.
        // We allocate all slots upfront so parallel fills land in the right places.
        // Complex containers get -1 (they recurse synchronously and push directly).
        const slots = new Array(visible.length).fill(null);
        const normalPending = [];
        const blurNodes = [];
        for (let i = 0; i < visible.length; i++) {
            const node = visible[i];
            const geom = getGeomBox(node);
            const nodeOpacity = 'opacity' in node ? node.opacity : 1;
            const totalOpacity = parentOpacity * nodeOpacity;
            const blendMode = ('blendMode' in node ? node.blendMode : 'NORMAL');
            const isContainer = (node.type === 'GROUP' || node.type === 'FRAME' ||
                node.type === 'COMPONENT' || node.type === 'INSTANCE') && 'children' in node;
            if (isContainer && !isPureVector(node)) {
                // Complex container — must recurse; mark slot for later.
                slots[i] = 'recurse';
                continue;
            }
            // Leaf or pure-vector group → export as PNG.
            const meta = { name: node.name, geom, totalOpacity, blendMode, labelColor };
            if (hasOverflowEffect(node)) {
                blurNodes.push({ slot: i, node, meta });
            }
            else {
                normalPending.push({ slot: i, promise: exportNodeFull(node), meta });
            }
        }
        // ── Parallel non-blur exports ─────────────────────────────────────────────
        const normalResults = yield Promise.all(normalPending.map(p => p.promise));
        for (let i = 0; i < normalPending.length; i++) {
            const { slot, meta } = normalPending[i];
            const result = normalResults[i];
            if (!result)
                continue;
            slots[slot] = {
                name: meta.name,
                pngBase64: figma.base64Encode(result.bytes),
                relX: result.box.x - originX,
                relY: result.box.y - originY,
                width: result.box.w,
                height: result.box.h,
                opacity: meta.totalOpacity,
                blendMode: meta.blendMode,
                labelColor: meta.labelColor,
            };
        }
        // ── Sequential blur exports ───────────────────────────────────────────────
        for (const { slot, node, meta } of blurNodes) {
            const result = yield exportNodeFull(node);
            if (!result)
                continue;
            slots[slot] = {
                name: meta.name,
                pngBase64: figma.base64Encode(result.bytes),
                relX: result.box.x - originX,
                relY: result.box.y - originY,
                width: result.box.w,
                height: result.box.h,
                opacity: meta.totalOpacity,
                blendMode: meta.blendMode,
                labelColor: meta.labelColor,
            };
        }
        // ── Recurse into complex containers + flush results in original order ─────
        for (let i = 0; i < visible.length; i++) {
            const slot = slots[i];
            if (slot === 'recurse') {
                const node = visible[i];
                const nodeOpacity = 'opacity' in node ? node.opacity : 1;
                const totalOpacity = parentOpacity * nodeOpacity;
                let thisGroupColor = labelColor;
                if (labelColor === 0) {
                    thisGroupColor = (colorCounter.n % 16) + 1;
                    colorCounter.n++;
                }
                yield collectLayers(node.children, originX, originY, totalOpacity, out, thisGroupColor, colorCounter);
            }
            else if (slot !== null) {
                out.push(slot);
            }
        }
    });
}
// ─── Top-level export ─────────────────────────────────────────────────────────
function exportGroup(group) {
    return __awaiter(this, void 0, void 0, function* () {
        const geom = getGeomBox(group);
        if (!geom)
            return null;
        const layers = [];
        // Frame / Component background fills
        if (group.type === 'FRAME' ||
            group.type === 'COMPONENT' ||
            group.type === 'INSTANCE') {
            const f = group;
            const hasFills = Array.isArray(f.fills) && f.fills.some((x) => x.visible !== false);
            const hasStrokes = Array.isArray(f.strokes) && f.strokes.some((x) => x.visible !== false);
            const hasEffects = Array.isArray(f.effects) && f.effects.some((x) => x.visible !== false);
            if (hasFills || hasStrokes || hasEffects) {
                try {
                    const tmp = figma.createRectangle();
                    tmp.resize(Math.max(geom.w, 1), Math.max(geom.h, 1));
                    if (hasFills)
                        tmp.fills = f.fills;
                    if (hasStrokes) {
                        tmp.strokes = f.strokes;
                        tmp.strokeWeight = f.strokeWeight;
                    }
                    if (hasEffects)
                        tmp.effects = f.effects;
                    if (f.cornerRadius !== figma.mixed)
                        tmp.cornerRadius = f.cornerRadius;
                    const bytes = yield tmp.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
                    tmp.remove();
                    layers.push({
                        name: group.name + ' Background',
                        pngBase64: figma.base64Encode(bytes),
                        relX: 0, relY: 0,
                        width: geom.w, height: geom.h,
                        opacity: 1, blendMode: 'NORMAL',
                        labelColor: 0,
                    });
                }
                catch (e) {
                    console.error('Failed to export frame background', e);
                }
            }
        }
        const frameChildren = 'children' in group
            ? group.children
            : [group];
        const colorCounter = { n: 0 };
        yield collectLayers(frameChildren, geom.x, geom.y, 1, layers, 0, colorCounter);
        return {
            name: group.name,
            groupWidth: geom.w,
            groupHeight: geom.h,
            absoluteX: geom.x,
            absoluteY: geom.y,
            layers,
        };
    });
}
// ─── Message handler ──────────────────────────────────────────────────────────
figma.ui.onmessage = (msg) => __awaiter(void 0, void 0, void 0, function* () {
    if (msg.type !== 'export-selection')
        return;
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
        figma.notify('⚠️ Select at least one group or frame first.');
        figma.ui.postMessage({ type: 'export-error', message: 'No selection' });
        return;
    }
    // ── Streaming export: one group at a time ────────────────────────────────
    // Each group is sent to the UI (and immediately to the server) as soon as
    // it finishes exporting. This keeps plugin memory bounded to ~1 group at a
    // time instead of accumulating every PNG before sending.
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
            const result = yield exportGroup(node);
            if (result) {
                figma.ui.postMessage({ type: 'export-group', group: result });
            }
        }
        catch (err) {
            console.error('Failed to export', node.name, err);
            figma.notify('❌ Error exporting ' + node.name + ': ' + err);
        }
    }
    figma.ui.postMessage({ type: 'export-done' });
});
