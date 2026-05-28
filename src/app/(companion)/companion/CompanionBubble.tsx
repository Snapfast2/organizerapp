'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './companion.module.css';

interface RecentFile {
  name: string;
  path: string;
  importedAt: string;
}

/* ── SVG Icons (monochrome, Figma-plugin style) ──────────────────── */
const CowSvg = ({ size = 14, fill = '#86efac' }: { size?: number; fill?: string }) => (
  <svg viewBox="0 -1.9 40 40" xmlns="http://www.w3.org/2000/svg" style={{ width: size, height: size, fill }}>
    <path d="M34,6.2h-2v-4c0-2.2-1.4-2.9-3.1-1.4l-6.5,5.4h-4.8l-6.5-5.4C9.4,0.4,8,1,8,3.2v4H6a6,6,0,0,0,0,12h.4l1.3,6.4A6.694,6.694,0,0,0,6,29.2a6.957,6.957,0,0,0,7,7h14a6.957,6.957,0,0,0,7-7,7.069,7.069,0,0,0-1.7-4.6l1.3-6.4h.4a6,6,0,0,0,0-12Zm-7,16H11.3l-.8-4H12a2,2,0,0,0,0-4h-2.2a4.457,4.457,0,0,1,.8-2.6A4.154,4.154,0,0,1,14,10.2h12a4.293,4.293,0,0,1,3.4,1.4,3.849,3.849,0,0,1,.8,2.6H28a2,2,0,0,0,0,4h1.5l-.8,4Zm-23-10a2.006,2.006,0,0,1,2-2h.8a8.77,8.77,0,0,0-1,4h0A2.046,2.046,0,0,1,4,12.2Zm23,20h-1v-2a2,2,0,0,0-4,0v2h-4v-2a2,2,0,0,0-4,0v2h-1a3,3,0,0,1,0-6h14a3,3,0,0,1,0,6Zm7.2-18h0a7.674,7.674,0,0,0-1-4h.8a2.006,2.006,0,0,1,2,2A2.046,2.046,0,0,1,34.2,14.2Z"/>
  </svg>
);

const MonitorSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="3" width="20" height="14" rx="2" stroke="#86efac" strokeWidth="2" fill="none"/>
    <path d="M8 21h8M12 17v4" stroke="#86efac" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const FolderSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="#86efac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

const ClockSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="#86efac" strokeWidth="2" fill="none"/>
    <path d="M12 6v6l4 2" stroke="#86efac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ZapSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#86efac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
  </svg>
);

const XSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 6L6 18M6 6l12 12" stroke="#888" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const FilmSvg = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="20" height="20" rx="2.18" stroke="#888" strokeWidth="2" fill="none"/>
    <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" stroke="#888" strokeWidth="2"/>
  </svg>
);

const ImageSvg = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke="#888" strokeWidth="2" fill="none"/>
    <circle cx="8.5" cy="8.5" r="1.5" fill="#888"/>
    <path d="M21 15l-5-5L5 21" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const AepSvg = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="20" height="20" rx="3" stroke="#888" strokeWidth="2" fill="none"/>
    <text x="12" y="16" textAnchor="middle" fill="#888" fontSize="10" fontWeight="bold" fontFamily="Inter, sans-serif">A</text>
  </svg>
);

const DocSvg = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const FigmaSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z" stroke="#18A0FB" strokeWidth="2" fill="none"/>
    <path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z" stroke="#18A0FB" strokeWidth="2" fill="none"/>
    <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z" stroke="#18A0FB" strokeWidth="2" fill="none"/>
    <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z" stroke="#18A0FB" strokeWidth="2" fill="none"/>
    <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z" stroke="#18A0FB" strokeWidth="2" fill="none"/>
  </svg>
);

/* ── ActionButton ─────────────────────────────────────────────────── */
interface ActionButtonProps {
  icon: React.ReactNode;
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
        <span className={styles.actionLabel}>{label} <span className={styles.hoverArrow}>→</span></span>
        {sublabel && <span className={styles.actionSub}>{sublabel}</span>}
      </span>
    </button>
  );
}

/* ── Helper: file icon by extension ───────────────────────────────── */
function FileIcon({ name }: { name: string }) {
  if (name.match(/\.(mp4|mov|webm|avi)$/i)) return <FilmSvg />;
  if (name.match(/\.(png|jpg|jpeg|webp|gif)$/i)) return <ImageSvg />;
  if (name.match(/\.(aep|aepx)$/i)) return <AepSvg />;
  return <DocSvg />;
}

/* ═══════════════════════════════════════════════════════════════════ */
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
        function getFolder(n) {
          for (var i = 1; i <= app.project.numItems; i++) {
            if (app.project.item(i) instanceof FolderItem && app.project.item(i).name === n) return app.project.item(i);
          }
          var f = app.project.items.addFolder(n);
          return f;
        }
        var figmaFolder = getFolder("Figma Imports");
        var payload = ${payloadStr};
        var imported = 0;
        for (var i = 0; i < payload.layers.length; i++) {
          try {
            var layer = payload.layers[i];
            var filePath = layer.localPath || layer.path;
            if (!filePath) continue;
            var f = new File(filePath);
            if (!f.exists) continue;
            var io = new ImportOptions(f);
            var item = app.project.importFile(io);
            item.name = layer.name || item.name;
            item.parentFolder = figmaFolder;
            imported++;
          } catch(e) {}
        }
        "Imported " + imported + " of " + payload.layers.length + " layers";
      `;
      api?.companion?.executeScript?.(scriptCode);
    } catch (err) {
      console.error('Figma accept error:', err);
    }
  };

  const handleDiscardFigma = async () => {
    try {
      await fetch('http://localhost:3000/api/ae-figma', { method: 'DELETE' });
    } catch {}
    setFigmaPayload(null);
  };

  /* ── Drag logic ────────────────────────────────────────────────── */
  const dragRef = useRef<{ startX: number; startY: number; dragging: boolean }>({
    startX: 0, startY: 0, dragging: false,
  });

  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, dragging: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    api?.companion?.startDrag?.();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const totalDx = e.clientX - dragRef.current.startX;
    const totalDy = e.clientY - dragRef.current.startY;

    if (!dragRef.current.dragging) {
      if (Math.abs(totalDx) > 5 || Math.abs(totalDy) > 5) {
        dragRef.current.dragging = true;
        setIsDragging(true);
        // Lock click-through OFF during drag so the window stays interactive
        api?.companion?.setClickThrough?.(false);
      } else return;
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
    setIsDragging(false);
  };

  return (
    <div className={styles.root}>
      <div
        className={`${styles.bubble} ${collapsed ? styles.bubbleCollapsed : styles.bubbleExpanded}`}
        ref={bubbleRef}
        onMouseEnter={() => { if (!isDragging) api?.companion?.setClickThrough?.(false); }}
        onMouseLeave={() => { if (!isDragging) api?.companion?.setClickThrough?.(true); }}
      >

        {/* ── Header (drag handle) ─────────────────────── */}
        <div
          className={collapsed ? styles.dragHandleCollapsed : styles.dragHandleExpanded}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title={collapsed ? 'MooMotion' : 'Colapsar menú'}
        >
          <span className={styles.cowIcon}>
            <CowSvg size={collapsed ? 22 : 11} fill={collapsed ? '#0EC900' : '#86efac'} />
          </span>
          
          {!collapsed && (
            <span className={styles.appName} style={{ pointerEvents: 'none' }}>MooMotion</span>
          )}
        </div>

        {/* ── Body (hidden when collapsed) ─────────────── */}
        {!collapsed && (
          <div className={styles.body}>

            {/* Project status */}
            <div className={styles.projectPill}>
              <span className={styles.projectDot} style={{ background: isAERunning ? '#4ade80' : '#6b7280' }} />
              <span className={styles.projectName}>
                {activeProject ?? (isAERunning ? 'AE abierto' : 'AE cerrado')}
              </span>
            </div>

            {/* Section: Actions */}
            <div className={styles.sectionLabel}>Actions</div>
            <div className={styles.actions}>

              {/* Figma notification */}
              {figmaPayload && (
                <div style={{
                  background: 'rgba(24, 160, 251, 0.08)',
                  border: '1px solid rgba(24, 160, 251, 0.25)',
                  borderRadius: 6, padding: 10, marginBottom: 4,
                  display: 'flex', flexDirection: 'column', gap: 6
                }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: '#18A0FB', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FigmaSvg /> Figma export ready!
                  </div>
                  <div style={{ fontSize: 10, color: '#888' }}>
                    {figmaPayload.layers?.length} layers from &quot;{figmaPayload.documentName}&quot;
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    <button onClick={handleAcceptFigma} style={{
                      flex: 1, background: '#18A0FB', color: 'white', border: 'none',
                      padding: '5px', borderRadius: 4, cursor: 'pointer', fontSize: 10.5,
                      fontWeight: 600, WebkitAppRegion: 'no-drag'
                    } as React.CSSProperties}>Export to AE</button>
                    <button onClick={handleDiscardFigma} style={{
                      flex: 1, background: 'rgba(255,255,255,0.06)', color: '#888', border: '1px solid rgba(255,255,255,0.08)',
                      padding: '5px', borderRadius: 4, cursor: 'pointer', fontSize: 10.5,
                      WebkitAppRegion: 'no-drag'
                    } as React.CSSProperties}>Discard</button>
                  </div>
                </div>
              )}

              <ActionButton
                icon={<MonitorSvg />}
                label="Abrir MooMotion"
                onClick={handleOpenMain}
                accent
              />
              <ActionButton
                icon={<FolderSvg />}
                label="Importar a AE"
                sublabel={isAERunning ? 'AE listo' : 'AE no detectado'}
                onClick={handleImportAE}
              />
            </div>

            {/* Section: Recents */}
            <div className={styles.sectionLabel}>Recientes</div>
            <button
              className={styles.sectionToggle}
              onClick={() => setShowRecents(r => !r)}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <span className={styles.sectionToggleLeft}>
                <ClockSvg /> Recientes
              </span>
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
                      <FileIcon name={f.name} />
                    </span>
                    <span className={styles.recentName}>{f.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Section: Quick */}
            <div className={styles.sectionLabel}>Quick</div>
            <div className={styles.actions}>
              <ActionButton
                icon={<ZapSvg />}
                label="Destinos rápidos"
                sublabel="Mover archivo"
                onClick={() => handleOpenMain()}
              />
              <ActionButton
                icon={<XSvg />}
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
