'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [collapsed, setCollapsed] = useState(false);
  const [isAERunning, setIsAERunning] = useState(false);

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
      } catch { /* ignore */ }
    };
    load();
    const iv = setInterval(load, 4000); // refresh every 4s
    return () => clearInterval(iv);
  }, [api]);

  const handleOpenMain = useCallback(() => api?.companion?.openMain?.(), [api]);
  const handleImportAE  = useCallback(() => api?.companion?.importToAE?.(), [api]);
  const handleHide      = useCallback(() => api?.companion?.hide?.(), [api]);

  return (
    <div className={styles.root}>
      <div className={styles.bubble}>

        {/* ── Drag handle ───────────────────────────────── */}
        <div
          className={styles.dragHandle}
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <span className={styles.cowIcon}>🐄</span>
          <span className={styles.appName}>MooMotion</span>
          <div
            className={styles.controls}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <button
              className={styles.ctrl}
              onClick={() => setCollapsed(c => !c)}
              title={collapsed ? 'Expandir' : 'Colapsar'}
            >
              {collapsed ? '▲' : '▼'}
            </button>
            <button
              className={`${styles.ctrl} ${styles.ctrlClose}`}
              onClick={handleHide}
              title="Cerrar"
            >
              ×
            </button>
          </div>
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
