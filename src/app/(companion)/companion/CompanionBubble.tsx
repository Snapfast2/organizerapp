'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './companion.module.css';

interface RecentFile {
  name: string;
  path: string;
  importedAt: string;
}

interface Reminder {
  id: string;
  text: string;
  time?: string;
  done: boolean;
  createdAt: string;
}

/* ── SVG Icons ──────────────────────────────────────────────────── */
const CowSvg = ({ size = 14, fill = '#86efac' }: { size?: number; fill?: string }) => (
  <svg viewBox="0 -1.9 40 40" xmlns="http://www.w3.org/2000/svg" style={{ width: size, height: size, fill }}>
    <path d="M34,6.2h-2v-4c0-2.2-1.4-2.9-3.1-1.4l-6.5,5.4h-4.8l-6.5-5.4C9.4,0.4,8,1,8,3.2v4H6a6,6,0,0,0,0,12h.4l1.3,6.4A6.694,6.694,0,0,0,6,29.2a6.957,6.957,0,0,0,7,7h14a6.957,6.957,0,0,0,7-7,7.069,7.069,0,0,0-1.7-4.6l1.3-6.4h.4a6,6,0,0,0,0-12Zm-7,16H11.3l-.8-4H12a2,2,0,0,0,0-4h-2.2a4.457,4.457,0,0,1,.8-2.6A4.154,4.154,0,0,1,14,10.2h12a4.293,4.293,0,0,1,3.4,1.4,3.849,3.849,0,0,1,.8,2.6H28a2,2,0,0,0,0,4h1.5l-.8,4Zm-23-10a2.006,2.006,0,0,1,2-2h.8a8.77,8.77,0,0,0-1,4h0A2.046,2.046,0,0,1,4,12.2Zm23,20h-1v-2a2,2,0,0,0-4,0v2h-4v-2a2,2,0,0,0-4,0v2h-1a3,3,0,0,1,0-6h14a3,3,0,0,1,0,6Zm7.2-18h0a7.674,7.674,0,0,0-1-4h.8a2.006,2.006,0,0,1,2,2A2.046,2.046,0,0,1,34.2,14.2Z"/>
  </svg>
);
const MonitorSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" stroke="#86efac" strokeWidth="2" fill="none"/><path d="M8 21h8M12 17v4" stroke="#86efac" strokeWidth="2" strokeLinecap="round"/></svg>
);
const FolderSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke="#86efac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
);
const ClockSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#86efac" strokeWidth="2" fill="none"/><path d="M12 6v6l4 2" stroke="#86efac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
);
const ZapSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#86efac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
);
const XSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#888" strokeWidth="2" strokeLinecap="round"/></svg>
);
const FilmSvg = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="2.18" stroke="#888" strokeWidth="2" fill="none"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" stroke="#888" strokeWidth="2"/></svg>
);
const ImageSvg = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="#888" strokeWidth="2" fill="none"/><circle cx="8.5" cy="8.5" r="1.5" fill="#888"/><path d="M21 15l-5-5L5 21" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
);
const AepSvg = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="3" stroke="#888" strokeWidth="2" fill="none"/><text x="12" y="16" textAnchor="middle" fill="#888" fontSize="10" fontWeight="bold" fontFamily="Inter, sans-serif">A</text></svg>
);
const DocSvg = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
);
const FigmaSvg = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z" stroke="#18A0FB" strokeWidth="2" fill="none"/><path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z" stroke="#18A0FB" strokeWidth="2" fill="none"/><path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z" stroke="#18A0FB" strokeWidth="2" fill="none"/><path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z" stroke="#18A0FB" strokeWidth="2" fill="none"/><path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z" stroke="#18A0FB" strokeWidth="2" fill="none"/></svg>
);

/* ── ActionButton ───────────────────────────────────────────────── */
interface ActionButtonProps { icon: React.ReactNode; label: string; sublabel?: string; onClick: () => void; accent?: boolean; }
function ActionButton({ icon, label, sublabel, onClick, accent }: ActionButtonProps) {
  return (
    <button className={`${styles.actionBtn} ${accent ? styles.actionBtnAccent : ''}`} onClick={onClick} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <span className={styles.actionIcon}>{icon}</span>
      <span className={styles.actionText}>
        <span className={styles.actionLabel}>{label} <span className={styles.hoverArrow}>→</span></span>
        {sublabel && <span className={styles.actionSub}>{sublabel}</span>}
      </span>
    </button>
  );
}

function FileIcon({ name }: { name: string }) {
  if (name.match(/\.(mp4|mov|webm|avi)$/i)) return <FilmSvg />;
  if (name.match(/\.(png|jpg|jpeg|webp|gif)$/i)) return <ImageSvg />;
  if (name.match(/\.(aep|aepx)$/i)) return <AepSvg />;
  return <DocSvg />;
}

const WORK_SECS   = 25 * 60;
const BREAK_SECS  = 5  * 60;
const LBREAK_SECS = 15 * 60;

/* ═══════════════════════════════════════════════════════════════════ */
export default function CompanionBubble() {
  const [activeProject, setActiveProject]           = useState<string | null>(null);
  const [realActiveProject, setRealActiveProject]   = useState<string | null>(null);
  const [isUntracked, setIsUntracked]               = useState(false);
  const [isMigrating, setIsMigrating]               = useState(false);
  const [exportSuccess, setExportSuccess]           = useState(false);
  const [recents, setRecents]                       = useState<RecentFile[]>([]);
  const [showRecents, setShowRecents]               = useState(false);
  const [collapsed, setCollapsed]                   = useState(true);
  const [isAERunning, setIsAERunning]               = useState(false);
  const [figmaPayload, setFigmaPayload]             = useState<any>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Pomodoro
  const [pomodoroRunning, setPomodoroRunning]       = useState(false);
  const [pomodoroMode, setPomodoroMode]             = useState<'work'|'break'|'longbreak'>('work');
  const [pomodoroCount, setPomodoroCount]           = useState(0);
  const [pomodoroSecondsLeft, setPomodoroSecondsLeft] = useState(WORK_SECS);
  const [showPomodoro, setShowPomodoro]             = useState(true);

  // Reminders
  const [reminders, setReminders]                   = useState<Reminder[]>([]);
  const [newReminderText, setNewReminderText]       = useState('');
  const [newReminderTime, setNewReminderTime]       = useState('');
  const [showAddReminder, setShowAddReminder]       = useState(false);
  const [showReminders, setShowReminders]           = useState(true);

  const api = typeof window !== 'undefined' ? (window as any).electronAPI : null;

  // Load project + recents
  useEffect(() => {
    const load = async () => {
      try {
        const isRunning = await api?.companion?.isAERunning?.();
        setIsAERunning(!!isRunning);
        let realProj = null;
        if (isRunning) {
          realProj = await api?.companion?.getRealAeProject?.();
          if (realProj) {
            setRealActiveProject(realProj);
            const inHub = await api?.companion?.isProjectInHub?.(realProj);
            setIsUntracked(!inHub);
            const parts = realProj.replace(/\\/g, '/').split('/');
            setActiveProject(parts[parts.length - 1]);
          } else { setIsUntracked(false); }
        } else { setIsUntracked(false); setRealActiveProject(null); }
        if (!realProj) { const proj = await api?.companion?.getActiveProject?.(); if (proj) setActiveProject(proj); }
        const r = await api?.companion?.getRecents?.();
        if (r) setRecents(r);
        try {
          const res = await fetch('http://localhost:3000/api/ae-figma');
          if (res.ok) {
            const json = await res.json();
            if (json.data && json.data.groups) {
              setFigmaPayload((prev: any) => { if (!prev || prev.timestamp !== json.data.timestamp) setCollapsed(false); return json.data; });
            } else { setFigmaPayload(null); }
          }
        } catch {}
      } catch {}
    };
    load();
    const iv = setInterval(load, 2000);
    return () => clearInterval(iv);
  }, [api]);

  // Pomodoro countdown
  useEffect(() => {
    if (!pomodoroRunning) return;
    if (pomodoroSecondsLeft <= 0) {
      setPomodoroRunning(false);
      try { new Notification(pomodoroMode === 'work' ? '🍅 Pomodoro completo!' : '☕ Descanso terminado!', { body: pomodoroMode === 'work' ? 'Hora de descansar.' : 'Volvé al trabajo!' }); } catch {}
      if (pomodoroMode === 'work') {
        const next = pomodoroCount + 1;
        setPomodoroCount(next);
        if (next % 4 === 0) { setPomodoroMode('longbreak'); setPomodoroSecondsLeft(LBREAK_SECS); }
        else { setPomodoroMode('break'); setPomodoroSecondsLeft(BREAK_SECS); }
      } else { setPomodoroMode('work'); setPomodoroSecondsLeft(WORK_SECS); }
      return;
    }
    const t = setTimeout(() => setPomodoroSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [pomodoroRunning, pomodoroSecondsLeft, pomodoroMode, pomodoroCount]);

  // Load reminders
  useEffect(() => { try { const s = localStorage.getItem('moo-reminders'); if (s) setReminders(JSON.parse(s)); } catch {} }, []);
  // Save reminders
  useEffect(() => { try { localStorage.setItem('moo-reminders', JSON.stringify(reminders)); } catch {} }, [reminders]);
  // Check time reminders
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const cur = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      setReminders(prev => prev.map(r => {
        if (r.time === cur && !r.done) { try { new Notification('🔔 MooMotion', { body: r.text }); } catch {} }
        return r;
      }));
    };
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, []);

  const resetPomodoro = () => { setPomodoroRunning(false); setPomodoroMode('work'); setPomodoroSecondsLeft(WORK_SECS); setPomodoroCount(0); };
  const pomodoroMins  = String(Math.floor(pomodoroSecondsLeft / 60)).padStart(2, '0');
  const pomodoroSecs  = String(pomodoroSecondsLeft % 60).padStart(2, '0');
  const pomColor      = pomodoroMode === 'work' ? '#4ade80' : pomodoroMode === 'break' ? '#60a5fa' : '#f472b6';
  const pomLabel      = pomodoroMode === 'work' ? 'Trabajo' : pomodoroMode === 'break' ? 'Descanso' : 'Descanso largo';
  const tomatoes      = pomodoroCount > 0 ? '🍅'.repeat(Math.min((pomodoroCount - 1) % 4 + 1, 4)) : '';

  const addReminder = () => {
    if (!newReminderText.trim()) return;
    setReminders(prev => [{ id: Date.now().toString(), text: newReminderText.trim(), time: newReminderTime || undefined, done: false, createdAt: new Date().toISOString() }, ...prev]);
    setNewReminderText(''); setNewReminderTime(''); setShowAddReminder(false);
  };
  const toggleReminder = (id: string) => setReminders(prev => prev.map(r => r.id === id ? { ...r, done: !r.done } : r));
  const deleteReminder = (id: string) => setReminders(prev => prev.filter(r => r.id !== id));
  const activeReminders = reminders.filter(r => !r.done);
  const doneReminders   = reminders.filter(r => r.done);

  const handleOpenMain = useCallback(() => api?.companion?.openMain?.(), [api]);
  const handleImportAE  = useCallback(() => api?.companion?.importToAE?.(), [api]);
  const handleHide      = useCallback(() => api?.companion?.hide?.(), [api]);

  const handleAcceptFigma = async () => {
    if (!figmaPayload) return;
    try {
      await fetch('http://localhost:3000/api/ae-figma', { method: 'DELETE' });
      const payloadStr = JSON.stringify(figmaPayload);
      setFigmaPayload(null);
      const scriptCode = `(function(){function getFolder(n){for(var i=1;i<=app.project.numItems;i++){if(app.project.item(i) instanceof FolderItem&&app.project.item(i).name===n)return app.project.item(i);}return app.project.items.addFolder(n);}function importFile(fp){var f=new File(fp);if(!f.exists)return null;return app.project.importFile(new ImportOptions(f));}var bm={"NORMAL":BlendingMode.NORMAL,"MULTIPLY":BlendingMode.MULTIPLY,"SCREEN":BlendingMode.SCREEN,"OVERLAY":BlendingMode.OVERLAY,"DARKEN":BlendingMode.DARKEN,"LIGHTEN":BlendingMode.LIGHTEN,"COLOR_DODGE":BlendingMode.COLOR_DODGE,"COLOR_BURN":BlendingMode.COLOR_BURN,"HARD_LIGHT":BlendingMode.HARD_LIGHT,"SOFT_LIGHT":BlendingMode.SOFT_LIGHT,"DIFFERENCE":BlendingMode.DIFFERENCE,"EXCLUSION":BlendingMode.EXCLUSION,"HUE":BlendingMode.HUE,"SATURATION":BlendingMode.SATURATION,"COLOR":BlendingMode.COLOR,"LUMINOSITY":BlendingMode.LUMINOSITY};function placeLayer(comp,ld,af,exportScale){var ft=importFile(ld.imagePath);if(!ft)return;ft.name=ld.name||ft.name;ft.parentFolder=af;var al=comp.layers.add(ft);al.name=ld.name||al.name;al.property("Position").setValue([ld.relX+ld.width/2,ld.relY+ld.height/2]);if(exportScale===2)al.property("Scale").setValue([50,50]);if(typeof ld.opacity==="number"&&ld.opacity<1)al.property("Opacity").setValue(ld.opacity*100);if(ld.blendMode&&bm[ld.blendMode])al.blendingMode=bm[ld.blendMode];}var figmaFolder=getFolder("Figma Imports");var assetsFolder=getFolder("_Assets");assetsFolder.parentFolder=figmaFolder;var payload=${payloadStr};var groups=payload.groups||[];var lastComp=null;for(var g=0;g<groups.length;g++){var gr=groups[g];var es=gr.exportScale||1;var cw=Math.round(gr.groupWidth)||1920;var ch=Math.round(gr.groupHeight)||1080;var pcMap={};var pcs=gr.precomps||[];for(var pi=0;pi<pcs.length;pi++){var pc=pcs[pi];var pw=Math.round(pc.width)||100;var ph=Math.round(pc.height)||100;var pcComp=app.project.items.addComp(pc.name||"Precomp_"+pi,pw,ph,1,10,30);pcComp.parentFolder=figmaFolder;var pcL=pc.layers||[];for(var si=0;si<pcL.length;si++)placeLayer(pcComp,pcL[si],assetsFolder,es);pcMap[pc.name]=pcComp;}var mc=app.project.items.addComp(gr.name||"Figma_"+g,cw,ch,1,10,30);mc.parentFolder=figmaFolder;var ls=gr.layers||[];for(var i=0;i<ls.length;i++){var l=ls[i];if(l.isPrecomp&&l.precompName&&pcMap[l.precompName]){var pl=mc.layers.add(pcMap[l.precompName]);pl.name=l.precompName;pl.property("Position").setValue([l.relX+l.width/2,l.relY+l.height/2]);if(typeof l.opacity==="number"&&l.opacity<1)pl.property("Opacity").setValue(l.opacity*100);if(l.blendMode&&bm[l.blendMode])pl.blendingMode=bm[l.blendMode];}else{placeLayer(mc,l,assetsFolder,es);}}lastComp=mc;}if(lastComp)lastComp.openInViewer();return"Built "+groups.length+" comps";})();`;
      api?.companion?.executeScript?.(scriptCode);
    } catch (err) { console.error('Figma accept error:', err); }
  };
  const handleDiscardFigma = async () => { try { await fetch('http://localhost:3000/api/ae-figma', { method: 'DELETE' }); } catch {} setFigmaPayload(null); };

  const dragRef = useRef<{ startX: number; startY: number; dragging: boolean }>({ startX: 0, startY: 0, dragging: false });
  const isDraggingRef = useRef(false);
  const handlePointerDown = (e: React.PointerEvent) => { dragRef.current = { startX: e.screenX, startY: e.screenY, dragging: false }; e.currentTarget.setPointerCapture(e.pointerId); api?.companion?.setClickThrough?.(false); api?.companion?.startDrag?.(); };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = e.screenX - dragRef.current.startX; const dy = e.screenY - dragRef.current.startY;
    if (!dragRef.current.dragging) { if (Math.abs(dx) > 5 || Math.abs(dy) > 5) { dragRef.current.dragging = true; isDraggingRef.current = true; } else return; }
    if (dragRef.current.dragging) api?.companion?.dragMove?.(dx, dy);
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) setCollapsed(c => !c);
    e.currentTarget.releasePointerCapture(e.pointerId); dragRef.current.dragging = false; isDraggingRef.current = false;
  };

  const handleSaveToHub = async () => {
    if (isMigrating) return; setIsMigrating(true);
    try {
      const realProj = await api?.companion?.getRealAeProject?.(); if (!realProj) { setIsMigrating(false); return; }
      const inHub = await api?.companion?.isProjectInHub?.(realProj); if (inHub) { setIsMigrating(false); return; }
      const res = await fetch('http://localhost:3000/api/ae-hub', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'migrate-project', filePath: realProj, targetDirectory: 'E:\\Motion' }) });
      const data = await res.json();
      if (res.ok && (data.newAepPath || data.path)) { const tp = data.newAepPath || data.path; api?.companion?.executeScript?.(`app.open(new File("${tp.replace(/\\/g, '/')}"));`); setRealActiveProject(null); setIsUntracked(false); setExportSuccess(true); setTimeout(() => setExportSuccess(false), 3000); }
    } catch (e) { console.error(e); } finally { setIsMigrating(false); }
  };

  const card: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 10px 8px' };
  const btnBase: React.CSSProperties = { border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'opacity 0.15s', WebkitAppRegion: 'no-drag' } as React.CSSProperties;

  return (
    <div className={styles.root}>
      <div className={`${styles.bubble} ${collapsed ? styles.bubbleCollapsed : styles.bubbleExpanded}`} ref={bubbleRef}
        onMouseEnter={() => { if (!isDraggingRef.current) api?.companion?.setClickThrough?.(false); }}
        onMouseLeave={() => { if (!isDraggingRef.current) api?.companion?.setClickThrough?.(true); }}
      >
        {/* Drag handle */}
        <div className={collapsed ? styles.dragHandleCollapsed : styles.dragHandleExpanded} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} title={collapsed ? 'MooMotion' : 'Colapsar'}>
          <span className={styles.cowIcon}><CowSvg size={collapsed ? 22 : 11} fill={collapsed ? '#0EC900' : '#86efac'} /></span>
          {!collapsed && <span className={styles.appName} style={{ pointerEvents: 'none' }}>MooMotion</span>}
        </div>

        {!collapsed && (
          <div className={styles.body}>

            {/* Project status */}
            <div className={styles.projectPill}>
              <span className={styles.projectDot} style={{ background: isAERunning ? '#4ade80' : '#6b7280' }} />
              <span className={styles.projectName}>{activeProject ?? (isAERunning ? 'AE abierto' : 'AE cerrado')}</span>
            </div>

            {/* Untracked project */}
            {isUntracked && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: 10, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#e5e7eb' }}>¿Proyecto externo?</div>
                <button onClick={handleSaveToHub} disabled={isMigrating || exportSuccess} style={{ background: exportSuccess ? '#0EC900' : '#18A0FB', color: 'white', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 10, cursor: (isMigrating || exportSuccess) ? 'not-allowed' : 'pointer', marginTop: 4, fontWeight: 600, transition: 'background 0.2s' }}>
                  {exportSuccess ? '✅ Exportado al Hub' : (isMigrating ? 'Moviendo...' : '📥 Organizar en el Hub')}
                </button>
              </div>
            )}

            {/* ══ POMODORO ════════════════════════════════════ */}
            <button className={styles.sectionToggle} onClick={() => setShowPomodoro(p => !p)} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <span className={styles.sectionToggleLeft}>
                🍅 Pomodoro
                {pomodoroRunning && <span style={{ marginLeft: 6, fontSize: 10, color: pomColor, fontWeight: 700 }}>{pomodoroMins}:{pomodoroSecs}</span>}
              </span>
              <span className={styles.chevron}>{showPomodoro ? '▲' : '▼'}</span>
            </button>

            {showPomodoro && (
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: pomColor, background: `${pomColor}22`, padding: '2px 7px', borderRadius: 20 }}>{pomLabel}</span>
                  <span style={{ fontSize: 11, color: '#555' }}>{tomatoes || '○○○○'}</span>
                </div>
                <div style={{ textAlign: 'center', fontSize: 36, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: 2, color: pomColor, lineHeight: 1, margin: '6px 0 10px', fontFamily: 'monospace' }}>
                  {pomodoroMins}:{pomodoroSecs}
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                  <button onClick={() => setPomodoroRunning(r => !r)} style={{ ...btnBase, flex: 1, padding: '6px 0', background: pomodoroRunning ? 'rgba(239,68,68,0.15)' : `${pomColor}22`, color: pomodoroRunning ? '#ef4444' : pomColor, border: `1px solid ${pomodoroRunning ? 'rgba(239,68,68,0.3)' : `${pomColor}44`}`, fontSize: 16 }} title={pomodoroRunning ? 'Pausar' : 'Iniciar'}>
                    {pomodoroRunning ? '⏸' : '▶'}
                  </button>
                  <button onClick={resetPomodoro} style={{ ...btnBase, padding: '6px 12px', background: 'rgba(255,255,255,0.06)', color: '#888', border: '1px solid rgba(255,255,255,0.1)', fontSize: 14 }} title="Reiniciar">↺</button>
                </div>
                {pomodoroCount > 0 && <div style={{ textAlign: 'center', fontSize: 10, color: '#555', marginTop: 6 }}>{pomodoroCount} sesión{pomodoroCount !== 1 ? 'es' : ''} completada{pomodoroCount !== 1 ? 's' : ''}</div>}
              </div>
            )}

            {/* ══ REMINDERS ═══════════════════════════════════ */}
            <button className={styles.sectionToggle} onClick={() => setShowReminders(r => !r)} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <span className={styles.sectionToggleLeft}>
                🔔 Reminders
                {activeReminders.length > 0 && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, background: '#4ade8033', color: '#4ade80', borderRadius: 10, padding: '1px 6px' }}>{activeReminders.length}</span>}
              </span>
              <span className={styles.chevron}>{showReminders ? '▲' : '▼'}</span>
            </button>

            {showReminders && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {activeReminders.map(r => (
                  <div key={r.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 7, padding: '7px 8px' }}>
                    <button onClick={() => toggleReminder(r.id)} style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: '1.5px solid #4ade80', background: 'transparent', cursor: 'pointer', WebkitAppRegion: 'no-drag' } as React.CSSProperties} title="Marcar hecho" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: '#e5e7eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.text}</div>
                      {r.time && <div style={{ fontSize: 9.5, color: '#6b7280', marginTop: 1 }}>⏰ {r.time}</div>}
                    </div>
                    <button onClick={() => deleteReminder(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', fontSize: 14, flexShrink: 0, padding: '0 2px', lineHeight: 1, WebkitAppRegion: 'no-drag' } as React.CSSProperties} title="Eliminar">×</button>
                  </div>
                ))}

                {doneReminders.length > 0 && (
                  <div style={{ fontSize: 10, color: '#3d3d3d', padding: '2px 4px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{doneReminders.length} hecho{doneReminders.length !== 1 ? 's' : ''}</span>
                    <button onClick={() => setReminders(prev => prev.filter(r => !r.done))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3d3d3d', fontSize: 10, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>limpiar</button>
                  </div>
                )}

                {showAddReminder ? (
                  <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input type="text" placeholder="¿Qué recordar?" value={newReminderText} onChange={e => setNewReminderText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addReminder(); if (e.key === 'Escape') setShowAddReminder(false); }} autoFocus
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '5px 8px', color: '#e5e7eb', fontSize: 11, outline: 'none', width: '100%', boxSizing: 'border-box', WebkitAppRegion: 'no-drag' } as React.CSSProperties} />
                    <input type="time" value={newReminderTime} onChange={e => setNewReminderTime(e.target.value)}
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '4px 8px', color: '#9ca3af', fontSize: 10.5, outline: 'none', width: '100%', boxSizing: 'border-box', colorScheme: 'dark', WebkitAppRegion: 'no-drag' } as React.CSSProperties} />
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={addReminder} style={{ ...btnBase, flex: 1, padding: '5px 0', background: '#4ade8022', color: '#4ade80', border: '1px solid #4ade8044' }}>Agregar</button>
                      <button onClick={() => { setShowAddReminder(false); setNewReminderText(''); setNewReminderTime(''); }} style={{ ...btnBase, padding: '5px 10px', background: 'rgba(255,255,255,0.05)', color: '#666', border: '1px solid rgba(255,255,255,0.08)' }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowAddReminder(true)} style={{ ...btnBase, width: '100%', padding: '6px 0', textAlign: 'center', background: 'rgba(255,255,255,0.03)', color: '#555', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 7, fontSize: 11 } as React.CSSProperties}>
                    + Agregar reminder
                  </button>
                )}
              </div>
            )}

            {/* Section: Actions */}
            <div className={styles.sectionLabel}>Actions</div>
            <div className={styles.actions}>
              {figmaPayload && (
                <div style={{ background: 'rgba(24,160,251,0.08)', border: '1px solid rgba(24,160,251,0.25)', borderRadius: 6, padding: 10, marginBottom: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: '#18A0FB', display: 'flex', alignItems: 'center', gap: 6 }}><FigmaSvg /> Figma export ready!</div>
                  <div style={{ fontSize: 10, color: '#888' }}>{figmaPayload.layers?.length} layers from &quot;{figmaPayload.documentName}&quot;</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    <button onClick={handleAcceptFigma} style={{ flex: 1, background: '#18A0FB', color: 'white', border: 'none', padding: '5px', borderRadius: 4, cursor: 'pointer', fontSize: 10.5, fontWeight: 600, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>Export to AE</button>
                    <button onClick={handleDiscardFigma} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', color: '#888', border: '1px solid rgba(255,255,255,0.08)', padding: '5px', borderRadius: 4, cursor: 'pointer', fontSize: 10.5, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>Discard</button>
                  </div>
                </div>
              )}
              <ActionButton icon={<FigmaSvg />} label="Abrir Figma" sublabel="Lanzamiento Rápido" onClick={() => api?.companion?.openFigma?.()} />
              <ActionButton icon={<MonitorSvg />} label="Abrir MooMotion" onClick={handleOpenMain} accent />
              <ActionButton icon={<FolderSvg />} label="Importar a AE" sublabel={isAERunning ? 'AE listo' : 'AE no detectado'} onClick={handleImportAE} />
            </div>

            {/* Section: Recents */}
            <div className={styles.sectionLabel}>Recientes</div>
            <button className={styles.sectionToggle} onClick={() => setShowRecents(r => !r)} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <span className={styles.sectionToggleLeft}><ClockSvg /> Recientes</span>
              <span className={styles.chevron}>{showRecents ? '▲' : '▼'}</span>
            </button>
            {showRecents && (
              <div className={styles.recentList}>
                {recents.length === 0 && <span className={styles.emptyNote}>Sin importaciones recientes</span>}
                {recents.slice(0, 4).map((f, i) => (
                  <button key={i} className={styles.recentItem} onClick={() => api?.companion?.importRecent?.(f.path)} style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} title={f.path}>
                    <span className={styles.recentIcon}><FileIcon name={f.name} /></span>
                    <span className={styles.recentName}>{f.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Section: Quick */}
            <div className={styles.sectionLabel}>Quick</div>
            <div className={styles.actions}>
              <ActionButton icon={<ZapSvg />} label="Destinos rápidos" sublabel="Mover archivo" onClick={() => handleOpenMain()} />
              <ActionButton icon={<XSvg />} label="Ocultar Widget" sublabel="Cierra este botón" onClick={handleHide} />
            </div>

            {/* Footer */}
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
