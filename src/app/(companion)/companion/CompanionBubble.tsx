'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './companion.module.css';

interface RecentFile {
  name: string;
  path: string;
  importedAt: string;
}

interface ActionButtonProps {
  icon: string;
  label: string;
  sublabel?: string;
  onClick: () => void;
  accent?: boolean;
}

function ActionButton({ icon, label, sublabel, onClick, accent }: ActionButtonProps) {
  return (
    <button
      className={`${styles.actionBtn} ${accent ? styles.actionBtnAccent : ''}`}
      onClick={onClick}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <span className={styles.actionIcon}>{icon}</span>
      <span className={styles.actionText}>
        <span className={styles.actionLabel}>{label}</span>
        {sublabel && <span className={styles.actionSub}>{sublabel}</span>}
      </span>
    </button>
  );
}

export default function CompanionBubble() {
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentFile[]>([]);
  const [showRecents, setShowRecents] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [isAERunning, setIsAERunning] = useState(false);
  const [figmaPayload, setFigmaPayload] = useState<any>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;

  // Load active project + recents
  useEffect(() => {
    const load = async () => {
      try {
        const proj = await api?.companion?.getActiveProject?.();
        if (proj) setActiveProject(proj);
        const isRunning = await api?.companion?.isAERunning?.();
        setIsAERunning(!!isRunning);
        const r = await api?.companion?.getRecents?.();
        if (r) setRecents(r);

        // Check for pending Figma imports
        try {
          const res = await fetch('http://localhost:3000/api/ae-figma');
          if (res.ok) {
            const json = await res.json();
            if (json.data && json.data.timestamp) {
              setFigmaPayload(json.data);
              setCollapsed(false); // Auto-expand to show notification
            } else {
              setFigmaPayload(null);
            }
          }
        } catch (e) {
          // Ignore network errors
        }
      } catch { /* ignore */ }
    };
    load();
    const iv = setInterval(load, 2000); // Polling every 2s for faster response
    return () => clearInterval(iv);
  }, [api]);

  const handleOpenMain = useCallback(() => api?.companion?.openMain?.(), [api]);
  const handleImportAE  = useCallback(() => api?.companion?.importToAE?.(), [api]);
  const handleHide      = useCallback(() => api?.companion?.hide?.(), [api]);

  const handleAcceptFigma = async () => {
    if (!figmaPayload) return;
    try {
      await fetch('http://localhost:3000/api/ae-figma', { method: 'DELETE' });
      const payloadStr = JSON.stringify(figmaPayload);
      setFigmaPayload(null);

      const scriptCode = `
        var data = ${payloadStr};
        app.beginUndoGroup("Figma Import");

        var blendMap = {
            "NORMAL":       BlendingMode.NORMAL,
            "MULTIPLY":     BlendingMode.MULTIPLY,
            "SCREEN":       BlendingMode.SCREEN,
            "OVERLAY":      BlendingMode.OVERLAY,
            "DARKEN":       BlendingMode.DARKEN,
            "LIGHTEN":      BlendingMode.LIGHTEN,
            "COLOR_DODGE":  BlendingMode.COLOR_DODGE,
            "COLOR_BURN":   BlendingMode.COLOR_BURN,
            "HARD_LIGHT":   BlendingMode.HARD_LIGHT,
            "SOFT_LIGHT":   BlendingMode.SOFT_LIGHT,
            "DIFFERENCE":   BlendingMode.DIFFERENCE,
            "EXCLUSION":    BlendingMode.EXCLUSION,
            "HUE":          BlendingMode.HUE,
            "SATURATION":   BlendingMode.SATURATION,
            "COLOR":        BlendingMode.COLOR,
            "LUMINOSITY":   BlendingMode.LUMINOSITY,
            "LINEAR_BURN":  BlendingMode.LINEAR_BURN,
            "LINEAR_DODGE": BlendingMode.ADD
        };

        var getFolder = function(name, parentFolder) {
            var target = parentFolder || app.project.rootFolder;
            for (var i = 1; i <= target.numItems; i++) {
                if (target.item(i) instanceof FolderItem && target.item(i).name === name) {
                    return target.item(i);
                }
            }
            return target.items.addFolder(name);
        };

        var figmaFolder = getFolder("Figma Imports");
        var docName = (data.documentName && data.documentName.trim() !== "") ? data.documentName : "Import";
        var docFolder = getFolder(docName, figmaFolder);
        var compsFolder = getFolder("Comps", docFolder);
        var precompsFolder = getFolder("Precomps", docFolder);
        var assetsFolder = getFolder("Assets", docFolder);

        // ── Step 0: Ensure OS File System Organization ───
        var fsAssetsDir = null;
        if (app.project.file) {
            var aeProjDir = app.project.file.parent.fsName;
            var osAssets = new Folder(aeProjDir + "/Assets");
            if (!osAssets.exists) osAssets.create();
            var osFigma = new Folder(osAssets.fsName + "/Figma Imports");
            if (!osFigma.exists) osFigma.create();
            
            var safeDocName = docName.replace(/[^a-z0-9_ -]/gi, '_');
            var osDoc = new Folder(osFigma.fsName + "/" + safeDocName);
            if (!osDoc.exists) osDoc.create();
            
            fsAssetsDir = osDoc;
        }

        function getFinalImagePath(tempPath) {
            if (!fsAssetsDir) return tempPath;
            var srcFile = new File(tempPath);
            if (!srcFile.exists) return tempPath;
            var dstFile = new File(fsAssetsDir.fsName + "/" + srcFile.name);
            srcFile.copy(dstFile.fsName);
            return dstFile.fsName;
        }

        var groups = data.groups || [];
        for (var g = 0; g < groups.length; g++) {
            var grp = groups[g];
            var gw  = Math.max(Math.round(grp.groupWidth  || 100), 4);
            var gh  = Math.max(Math.round(grp.groupHeight || 100), 4);
            var aeScale = (grp.exportScale === 2) ? 50 : 100;

            var precomp = app.project.items.addComp(
                grp.name || ("Group " + g),
                gw, gh, 1, 10, 30
            );
            precomp.parentFolder = compsFolder;

            // ── Step 1: create sub-comps for any *-prefixed precomp groups ───
            var precompMap = {};
            var precompSpecs = grp.precomps || [];
            for (var pi = 0; pi < precompSpecs.length; pi++) {
                var ps  = precompSpecs[pi];
                var psw = Math.max(Math.round(ps.width  || 100), 4);
                var psh = Math.max(Math.round(ps.height || 100), 4);

                var subComp = app.project.items.addComp(
                    ps.name || ("Precomp " + pi),
                    psw, psh, 1, 10, 30
                );
                subComp.parentFolder = precompsFolder;
                precompMap[ps.name] = subComp;

                var subLayers = ps.layers || [];
                for (var si = 0; si < subLayers.length; si++) {
                    var sl = subLayers[si];
                    if (!sl.imagePath) continue;

                    var finalPath = getFinalImagePath(sl.imagePath);
                    var sio = new ImportOptions(new File(finalPath));
                    if (!sio.canImportAs(ImportAsType.FOOTAGE)) continue;

                    var sFootage = app.project.importFile(sio);
                    sFootage.name = sl.name || ("Layer " + si);
                    sFootage.parentFolder = assetsFolder;

                    var sLayer = subComp.layers.add(sFootage);
                    sLayer.name = sl.name || ("Layer " + si);

                    var scx = sl.relX + sl.width  / 2;
                    var scy = sl.relY + sl.height / 2;
                    sLayer.property("Transform").property("Position").setValue([scx, scy]);
                    sLayer.property("Transform").property("Scale").setValue([aeScale, aeScale]);

                    var sOp = (sl.opacity !== undefined) ? sl.opacity : 1;
                    sLayer.property("Transform").property("Opacity").setValue(sOp * 100);

                    if (sl.blendMode && blendMap[sl.blendMode] !== undefined) {
                        try { sLayer.blendingMode = blendMap[sl.blendMode]; } catch(e) {}
                    }
                    if (sl.labelColor !== undefined) {
                        try { sLayer.label = sl.labelColor; } catch(e) {}
                    }
                }
            }

            // ── Step 2: add flat layers + precomp-ref layers to main comp ───
            var layers = grp.layers || [];
            for (var i = 0; i < layers.length; i++) {
                var l = layers[i];

                if (l.isPrecomp) {
                    // Place the sub-comp as a precomp layer in the main comp.
                    var subCompRef = precompMap[l.precompName];
                    if (!subCompRef) continue;

                    var pcLayer = precomp.layers.add(subCompRef);
                    pcLayer.name = l.name || l.precompName;

                    // Center the precomp at its correct position.
                    var pccx = l.relX + l.width  / 2;
                    var pccy = l.relY + l.height / 2;
                    pcLayer.property("Transform").property("Position").setValue([pccx, pccy]);
                    // Precomp layer itself always 100% — scaling happens inside.
                    pcLayer.property("Transform").property("Scale").setValue([100, 100]);

                    var pcOp = (l.opacity !== undefined) ? l.opacity : 1;
                    pcLayer.property("Transform").property("Opacity").setValue(pcOp * 100);

                    if (l.blendMode && blendMap[l.blendMode] !== undefined) {
                        try { pcLayer.blendingMode = blendMap[l.blendMode]; } catch(e) {}
                    }
                    if (l.labelColor !== undefined) {
                        try { pcLayer.label = l.labelColor; } catch(e) {}
                    }
                    continue;
                }

                if (!l.imagePath) continue;

                var finalPath = getFinalImagePath(l.imagePath);
                var io = new ImportOptions(new File(finalPath));
                if (!io.canImportAs(ImportAsType.FOOTAGE)) continue;

                var footage = app.project.importFile(io);
                footage.name = l.name || ("Layer " + i);
                footage.parentFolder = assetsFolder;

                var aeLayer = precomp.layers.add(footage);
                aeLayer.name = l.name || ("Layer " + i);

                // Position = geometry center in comp space.
                var cx = l.relX + l.width  / 2;
                var cy = l.relY + l.height / 2;
                aeLayer.property("Transform").property("Position").setValue([cx, cy]);

                // 1x export → 100% scale, 2x export → 50% scale.
                aeLayer.property("Transform").property("Scale").setValue([aeScale, aeScale]);

                var op = (l.opacity !== undefined) ? l.opacity : 1;
                aeLayer.property("Transform").property("Opacity").setValue(op * 100);

                if (l.blendMode && blendMap[l.blendMode] !== undefined) {
                    try { aeLayer.blendingMode = blendMap[l.blendMode]; } catch(e) {}
                }

                if (l.labelColor !== undefined) {
                    try { aeLayer.label = l.labelColor; } catch(e) {}
                }
            }

            precomp.openInViewer();
        }

        app.endUndoGroup();
      `;


      api?.companion?.executeScript?.(scriptCode);
    } catch (e) {
      console.error('Error handling figma import', e);
    }
  };

  const handleDiscardFigma = async () => {
    try {
      await fetch('http://localhost:3000/api/ae-figma', { method: 'DELETE' });
      setFigmaPayload(null);
    } catch (e) {
      console.error(e);
    }
  };

  const dragRef = useRef({ startX: 0, startY: 0, dragging: false });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragRef.current = { 
      startX: e.screenX, 
      startY: e.screenY, 
      dragging: false 
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return; 
    const { startX, startY } = dragRef.current;
    
    const totalDx = e.screenX - startX;
    const totalDy = e.screenY - startY;

    if (!dragRef.current.dragging) {
      if (Math.abs(totalDx) > 4 || Math.abs(totalDy) > 4) {
        dragRef.current.dragging = true;
        api?.companion?.startDrag?.(); // Store initial window position
      }
    }
    
    if (dragRef.current.dragging) {
      api?.companion?.dragMove?.(totalDx, totalDy);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) {
      setCollapsed(c => !c);
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current.dragging = false;
  };

  return (
    <div className={styles.root}>
      <div
        className={`${styles.bubble} ${collapsed ? styles.bubbleCollapsed : styles.bubbleExpanded}`}
        ref={bubbleRef}
        onMouseEnter={() => api?.companion?.setClickThrough?.(false)}
        onMouseLeave={() => api?.companion?.setClickThrough?.(true)}
      >

        {/* ── Drag handle ───────────────────────────────── */}
        <div
          className={collapsed ? styles.dragHandleCollapsed : styles.dragHandleExpanded}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title={collapsed ? 'MooMotion' : 'Colapsar menú'}
        >
          <div 
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' } as React.CSSProperties}
          >
            <span className={styles.cowIcon}>
              <svg viewBox="0 -1.9 40 40" xmlns="http://www.w3.org/2000/svg" style={{ width: 22, height: 22, fill: '#0EC900' }}>
                <path d="M34,6.2h-2v-4c0-2.2-1.4-2.9-3.1-1.4l-6.5,5.4h-4.8l-6.5-5.4C9.4,0.4,8,1,8,3.2v4H6a6,6,0,0,0,0,12h.4l1.3,6.4A6.694,6.694,0,0,0,6,29.2a6.957,6.957,0,0,0,7,7h14a6.957,6.957,0,0,0,7-7,7.069,7.069,0,0,0-1.7-4.6l1.3-6.4h.4a6,6,0,0,0,0-12Zm-7,16H11.3l-.8-4H12a2,2,0,0,0,0-4h-2.2a4.457,4.457,0,0,1,.8-2.6A4.154,4.154,0,0,1,14,10.2h12a4.293,4.293,0,0,1,3.4,1.4,3.849,3.849,0,0,1,.8,2.6H28a2,2,0,0,0,0,4h1.5l-.8,4Zm-23-10a2.006,2.006,0,0,1,2-2h.8a8.77,8.77,0,0,0-1,4h0A2.046,2.046,0,0,1,4,12.2Zm23,20h-1v-2a2,2,0,0,0-4,0v2h-4v-2a2,2,0,0,0-4,0v2h-1a3,3,0,0,1,0-6h14a3,3,0,0,1,0,6Zm7.2-18h0a7.674,7.674,0,0,0-1-4h.8a2.006,2.006,0,0,1,2,2A2.046,2.046,0,0,1,34.2,14.2Z"/>
              </svg>
            </span>
          </div>
          
          {!collapsed && (
            <span className={styles.appName} style={{ pointerEvents: 'none' }}>MooMotion</span>
          )}
        </div>

        {/* ── Body (hidden when collapsed) ─────────────── */}
        {!collapsed && (
          <div className={styles.body}>

            {/* Active project pill */}
            <div className={styles.projectPill}>
              <span className={styles.projectDot} style={{ background: isAERunning ? '#4ade80' : '#6b7280' }} />
              <span className={styles.projectName}>
                {activeProject ?? (isAERunning ? 'AE abierto' : 'AE cerrado')}
              </span>
            </div>

            {/* Actions */}
            <div className={styles.actions}>
              {figmaPayload && (
                <div style={{ background: 'rgba(24, 160, 251, 0.15)', border: '1px solid #18A0FB', borderRadius: 8, padding: 12, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 'bold', color: '#18A0FB', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🎨</span> Figma export ready!
                  </div>
                  <div style={{ fontSize: 11, color: '#e5e7eb' }}>
                    {figmaPayload.layers?.length} layers received from "{figmaPayload.documentName}"
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button onClick={handleAcceptFigma} style={{ flex: 1, background: '#18A0FB', color: 'white', border: 'none', padding: '6px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 'bold', WebkitAppRegion: 'no-drag' } as React.CSSProperties}>Export to AE</button>
                    <button onClick={handleDiscardFigma} style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '6px', borderRadius: 4, cursor: 'pointer', fontSize: 12, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>Discard</button>
                  </div>
                </div>
              )}

              <ActionButton
                icon="🖥️"
                label="Abrir MooMotion"
                onClick={handleOpenMain}
                accent
              />
              <ActionButton
                icon="📁"
                label="Importar a AE"
                sublabel={isAERunning ? 'AE listo' : 'AE no detectado'}
                onClick={handleImportAE}
              />

              {/* Recents toggle */}
              <button
                className={styles.sectionToggle}
                onClick={() => setShowRecents(r => !r)}
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                <span>🕐 Recientes</span>
                <span className={styles.chevron}>{showRecents ? '▲' : '▼'}</span>
              </button>
              {showRecents && (
                <div className={styles.recentList}>
                  {recents.length === 0 && (
                    <span className={styles.emptyNote}>Sin importaciones recientes</span>
                  )}
                  {recents.slice(0, 4).map((f, i) => (
                    <button
                      key={i}
                      className={styles.recentItem}
                      onClick={() => api?.companion?.importRecent?.(f.path)}
                      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                      title={f.path}
                    >
                      <span className={styles.recentIcon}>
                        {f.name.match(/\.(mp4|mov|webm|avi)$/i) ? '🎬' :
                         f.name.match(/\.(png|jpg|jpeg|webp|gif)$/i) ? '🖼️' :
                         f.name.match(/\.(aep|aepx)$/i) ? '🎞️' : '📄'}
                      </span>
                      <span className={styles.recentName}>{f.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Quick destinations */}
              <ActionButton
                icon="⚡"
                label="Destinos rápidos"
                sublabel="Mover archivo"
                onClick={() => handleOpenMain()}
              />

              {/* Hide Button */}
              <ActionButton
                icon="❌"
                label="Ocultar Widget"
                sublabel="Cierra este botón"
                onClick={handleHide}
              />
            </div>

            {/* Footer shortcut hint */}
            <div className={styles.footer}>
              <kbd className={styles.kbd}>Ctrl</kbd>
              <kbd className={styles.kbd}>Shift</kbd>
              <kbd className={styles.kbd}>M</kbd>
              <span className={styles.footerText}>para mostrar/ocultar</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
