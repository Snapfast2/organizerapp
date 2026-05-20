'use client';
import { useState, useEffect, useCallback, useRef, useDeferredValue } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder, File, Image, Film, Music, FileText, Archive, Code, HardDrive,
  Search, Grid, List, ChevronRight, HomeIcon, ArrowLeft, ArrowUp, ArrowDown, Plus,
  Trash2, Trash, Edit2, RefreshCw, BarChart2, Wand2, X, CheckCircle, AlertCircle, 
  Terminal, Monitor, Type, AlertTriangle, ArrowRight, Play, ZoomIn, ChevronLeft,
  Pause, Volume2, VolumeX, SkipBack, SkipForward, Maximize, FolderOpen, FileArchive,
  FolderPlus, MoveRight, Copy, CheckSquare, Square, ExternalLink, Info
} from 'lucide-react';
import { FileEntry, DirectoryListing, DiskStats, OrganizePreview } from '@/lib/types';
import { getFileTypeInfo, formatSize, formatDate } from '@/lib/file-types';

// ─── Constants ────────────────────────────────────────────
const IMAGE_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','svg','ico','tiff','tif','heic']);
const VIDEO_EXTS = new Set(['mp4','webm','mov','avi','mkv','wmv','flv','m4v']);
const DOC_EXTS = new Set(['pdf', 'psd', 'psb']);
const PREVIEWABLE = new Set([...IMAGE_EXTS, ...VIDEO_EXTS, ...DOC_EXTS]);

// ─── Global thumbnail cache ────────────────────────────────
const thumbCache = new Map<string, string>();

// ─── Concurrency limiter ───────────────────────────────────
const MAX_CONCURRENT = 3;
let activeThumbRequests = 0;
const thumbQueue: Array<() => void> = [];

function acquireThumbSlot(): Promise<void> {
  return new Promise(resolve => {
    if (activeThumbRequests < MAX_CONCURRENT) {
      activeThumbRequests++;
      resolve();
    } else {
      thumbQueue.push(() => { activeThumbRequests++; resolve(); });
    }
  });
}

function releaseThumbSlot() {
  activeThumbRequests--;
  const next = thumbQueue.shift();
  if (next) next();
}

// ─── Inline Rename Component ─────────────────────────────────
export function InlineRenameInput({ entry, onConfirm, onCancel }: { entry: FileEntry, onConfirm: (path: string, newName: string) => void, onCancel: () => void }) {
  const [name, setName] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      const dotIndex = entry.name.lastIndexOf('.');
      if (dotIndex > 0 && !entry.isDir) {
        inputRef.current.setSelectionRange(0, dotIndex);
      } else {
        inputRef.current.select();
      }
    }
  }, [entry.name, entry.isDir]);

  return (
    <input
      ref={inputRef}
      value={name}
      onChange={e => setName(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') onConfirm(entry.path, name);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => onConfirm(entry.path, name)}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      className="inline-rename-input"
      style={{
        width: '100%',
        padding: '2px 4px',
        border: '1px solid var(--accent)',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        borderRadius: 4,
        fontSize: 'inherit',
        fontFamily: 'inherit',
        outline: 'none',
        marginTop: -3,
        marginBottom: -3,
        zIndex: 10
      }}
    />
  );
}

// ─── File Checkbox ───────────────────────────────────────────
export function FileCheckbox({ selected, onToggle }: { selected: boolean; onToggle: () => void }) {
  return (
    <div 
      className={`file-checkbox ${selected ? 'checked' : ''}`}
      onClick={e => { e.stopPropagation(); onToggle(); }}
      title={selected ? "Deseleccionar" : "Seleccionar"}
    >
      {selected ? <CheckSquare size={16} color="var(--primary)" /> : <Square size={16} color="rgba(255,255,255,0.4)" />}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────
type Toast = { id: number; message: string; type: 'success' | 'error' };

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const show = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  return { toasts, show };
}

// ─── Category Icon ─────────────────────────────────────────
export function getCategoryIcon(category: string) {
  const map: Record<string, any> = {
    image: Image, video: Film, audio: Music, document: FileText,
    spreadsheet: BarChart2, presentation: Monitor, archive: FileArchive,
    code: Code, executable: Terminal, font: Type, folder: Folder, other: File,
  };
  return map[category] || File;
}

// ─── Video Thumbnail ───────────────────────────────────────
export function VideoThumb({ src, size, mini = false, cover = false }: { src: string; size?: number; mini?: boolean; cover?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(thumbCache.get(src) ?? null);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (thumbCache.has(src)) return;
    const el = wrapRef.current;
    if (!el) return;
    let cancelled = false;
    const obs = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        await acquireThumbSlot();
        if (cancelled) { releaseThumbSlot(); return; }
        try {
          const encodedPath = src.split('path=')[1] ?? '';
          const thumbSrc = `/api/thumb?path=${encodedPath}`;
          const res = await fetch(thumbSrc);
          if (!res.ok || cancelled) return;
          const blob = await res.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          thumbCache.set(src, url);
          setThumbUrl(url);
        } catch {
        } finally {
          releaseThumbSlot();
        }
      },
      { rootMargin: '120px' },
    );
    obs.observe(el);
    return () => { cancelled = true; obs.disconnect(); };
  }, [src]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: cover ? '100%' : size,
        height: cover ? '100%' : size,
        position: 'relative',
        borderRadius: mini ? 4 : cover ? 0 : 8,
        overflow: 'hidden',
        background: '#050805',
        cursor: 'pointer',
      }}
      onMouseEnter={() => { if (!mini && thumbUrl) setHovering(true); }}
      onMouseLeave={() => { if (!mini) setHovering(false); }}
    >
      {hovering ? (
        <video 
          src={src} 
          autoPlay loop muted playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', zIndex: 2 }} 
        />
      ) : null}
      
      {thumbUrl && (
        <img
          src={thumbUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      )}
      {!thumbUrl && !hovering && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#080d08',
        }}>
          <Film size={mini ? 12 : (size ? size * 0.35 : 24)} color="#1a3a1a" />
        </div>
      )}
      {!mini && thumbUrl && !hovering && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.32)',
          transition: 'background 0.2s',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)',
            border: '1.5px solid rgba(255,255,255,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Play size={11} color="#fff" fill="#fff" style={{ marginLeft: 1 }} />
          </div>
        </div>
      )}
      {!mini && hovering && (
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: 8,
          boxShadow: 'inset 0 0 0 1.5px rgba(14,201,0,0.5)',
          pointerEvents: 'none',
          zIndex: 3
        }} />
      )}
    </div>
  );
}

// ─── Image Cover ────────────────────────────────────────────
export function ImageCover({ src, name, ext }: { src: string; name: string; ext: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);
  const isGif = ext === 'gif';

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: '150px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#050805' }}>
      {!loaded && !error && (
        <div className="skeleton-shimmer" style={{ position: 'absolute', inset: 0 }}>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Image size={24} color="#1a3a1a" />
          </div>
        </div>
      )}
      {visible && !error && (
        <img
          src={src}
          alt={name}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            display: 'block',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}
      {isGif && loaded && (
        <div style={{
          position: 'absolute', top: 7, right: 7,
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(14,201,0,0.4)',
          borderRadius: 5,
          padding: '1px 5px',
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: '#0EC900',
          lineHeight: 1.6,
          userSelect: 'none',
        }}>GIF</div>
      )}
      {error && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#060d06',
        }}>
          <Image size={24} color="#1a3a1a" />
        </div>
      )}
    </div>
  );
}

// ─── Document Cover (PDF / PSD) ─────────────────────────────
export function DocCover({ src, name, ext }: { src: string; name: string; ext: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
          
          acquireThumbSlot().then(() => {
            const thumbUrl = `/api/thumb-doc?path=${encodeURIComponent(src)}`;
            const img = new window.Image();
            img.src = thumbUrl;
            img.onload = () => {
              setThumb(thumbUrl);
              setLoaded(true);
              releaseThumbSlot();
            };
            img.onerror = () => {
              setError(true);
              releaseThumbSlot();
            };
          });
        }
      },
      { rootMargin: '120px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [src]);

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%', position: 'relative', background: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {!loaded && !error && (
        <div className="skeleton-shimmer" style={{ position: 'absolute', inset: 0 }}>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileText size={24} color="rgba(255,255,255,0.15)" />
          </div>
        </div>
      )}
      {thumb && !error && (
        <img
          src={thumb}
          alt={name}
          style={{
            width: '100%', height: '100%',
            objectFit: 'contain',
            display: 'block',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 0.25s ease',
          }}
        />
      )}
      {error && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-muted)'
        }}>
          {ext === 'pdf' ? <FileText size={28} color="#ff4444" /> : <Image size={28} color="#00a8ff" />}
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{ext}</span>
        </div>
      )}
    </div>
  );
}

// ─── File Thumbnail (grid) ─────────────────────────────────
export function FileThumbnail({ entry, size = 56 }: { entry: FileEntry; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const isImage = IMAGE_EXTS.has(entry.ext);
  const isVideo = VIDEO_EXTS.has(entry.ext);
  const info = getFileTypeInfo(entry.ext);
  const Icon = entry.isDir ? Folder : getCategoryIcon(info.category);
  const iconColor = entry.isDir ? '#00c8a0' : info.color;
  const iconBg = entry.isDir ? 'rgba(0,200,160,0.12)' : info.bgColor + '28';
  const previewUrl = `/api/preview?path=${encodeURIComponent(entry.path)}`;

  if (!entry.isDir && isImage && !imgError) {
    return (
      <div className="file-thumb" style={{ width: size, height: size }}>
        <img src={previewUrl} alt={entry.name} onError={() => setImgError(true)} loading="lazy" />
      </div>
    );
  }
  if (!entry.isDir && isVideo) {
    return <VideoThumb src={previewUrl} size={size} />;
  }
  return (
    <div className="file-thumb" style={{ width: size, height: size }}>
      <div className="file-thumb-icon" style={{ background: iconBg }}>
        <Icon size={size * 0.38} color={iconColor} />
      </div>
    </div>
  );
}

// ─── File List Icon (list view) ────────────────────────────
export function FileListIcon({ entry }: { entry: FileEntry }) {
  const [imgError, setImgError] = useState(false);
  const isImage = IMAGE_EXTS.has(entry.ext);
  const isVideo = VIDEO_EXTS.has(entry.ext);
  const info = getFileTypeInfo(entry.ext);
  const Icon = entry.isDir ? Folder : getCategoryIcon(info.category);
  const iconColor = entry.isDir ? '#00c8a0' : info.color;
  const iconBg = entry.isDir ? 'rgba(0,200,160,0.12)' : info.bgColor + '28';
  const previewUrl = `/api/preview?path=${encodeURIComponent(entry.path)}`;

  if (!entry.isDir && isImage && !imgError) {
    return (
      <div className="file-list-icon" style={{ background: 'transparent' }}>
        <img src={previewUrl} alt="" onError={() => setImgError(true)} loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />
      </div>
    );
  }
  if (!entry.isDir && isVideo) {
    return (
      <div className="file-list-icon" style={{ background: 'transparent', padding: 0 }}>
        <VideoThumb src={previewUrl} size={30} mini />
      </div>
    );
  }
  return (
    <div className="file-list-icon" style={{ background: iconBg }}>
      <Icon size={15} color={iconColor} />
    </div>
  );
}

// ─── Custom Video Player ──────────────────────────────────────
export function VideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fmt = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const resetHideTimer = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (playing) setShowControls(false); }, 2800);
  };

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else          { v.pause(); setPlaying(false); setShowControls(true); }
    resetHideTimer();
  };

  const skip = (secs: number) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + secs));
    resetHideTimer();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Number(e.target.value);
    setProgress(v.currentTime);
    resetHideTimer();
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current; if (!v) return;
    const val = Number(e.target.value);
    v.volume = val; setVolume(val); setMuted(val === 0);
  };

  const toggleMute = () => {
    const v = videoRef.current; if (!v) return;
    v.muted = !v.muted; setMuted(v.muted);
  };

  const toggleFullscreen = () => {
    const v = videoRef.current; if (!v) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else v.requestFullscreen();
  };

  return (
    <div
      className="custom-player"
      onMouseMove={resetHideTimer}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={src}
        className="custom-player-video"
        onTimeUpdate={e => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setShowControls(true); }}
      />
      {!playing && (
        <div className="player-center-play">
          <Play size={48} color="#fff" fill="#fff" />
        </div>
      )}
      <div className={`player-controls ${showControls ? 'visible' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="player-seek-row">
          <span className="player-time">{fmt(progress)}</span>
          <input
            type="range" className="player-seek"
            min={0} max={duration || 100} step={0.1}
            value={progress}
            onChange={handleSeek}
          />
          <span className="player-time">{fmt(duration)}</span>
        </div>
        <div className="player-btn-row">
          <button className="player-btn" onClick={toggleMute} title="Mute">
            {muted || volume === 0
              ? <VolumeX size={15} />
              : <Volume2 size={15} />}
          </button>
          <input
            type="range" className="player-vol"
            min={0} max={1} step={0.02}
            value={muted ? 0 : volume}
            onChange={handleVolume}
            onClick={e => e.stopPropagation()}
          />
          <div style={{ flex: 1 }} />
          <button className="player-btn" onClick={() => skip(-10)} title="-10s">
            <SkipBack size={15} />
          </button>
          <button className="player-btn player-btn-main" onClick={togglePlay} title="Play/Pause">
            {playing ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
          </button>
          <button className="player-btn" onClick={() => skip(10)} title="+10s">
            <SkipForward size={15} />
          </button>
          <div style={{ flex: 1 }} />
          <button className="player-btn" onClick={toggleFullscreen} title="Pantalla completa">
            <Maximize size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview Modal ─────────────────────────────────────────────
export function PreviewModal({ entry, allPreviewable, onClose }: {
  entry: FileEntry;
  allPreviewable: FileEntry[];
  onClose: () => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(() => allPreviewable.findIndex(e => e.path === entry.path));
  const current = allPreviewable[currentIdx] || entry;
  const isImage = IMAGE_EXTS.has(current.ext);
  const isVideo = VIDEO_EXTS.has(current.ext);

  const goNext = useCallback(() => setCurrentIdx(i => Math.min(i + 1, allPreviewable.length - 1)), [allPreviewable.length]);
  const goPrev = useCallback(() => setCurrentIdx(i => Math.max(i - 1, 0)), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, goNext, goPrev]);

  const previewUrl = `/api/preview?path=${encodeURIComponent(current.path)}`;

  return (
    <div
      className="preview-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="preview-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="preview-filename">{current.name}</span>
          <span className="preview-filesize">{formatSize(current.size)}</span>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ color: '#fff' }}>
          <X size={18} />
        </button>
      </div>
      {isImage && (
        <img
          key={current.path}
          src={previewUrl}
          alt={current.name}
          className="preview-img"
        />
      )}
      {isVideo && (
        <VideoPlayer key={current.path} src={previewUrl} />
      )}
      {current.ext === 'pdf' && (
        <iframe
          key={current.path}
          src={previewUrl}
          className="preview-pdf"
          style={{ width: '85vw', height: '80vh', border: 'none', borderRadius: 8, background: '#1c1c1f' }}
        />
      )}
      {(current.ext === 'psd' || current.ext === 'psb') && (
        <img
          key={current.path}
          src={`/api/thumb-doc?path=${encodeURIComponent(current.path)}`}
          alt={current.name}
          className="preview-img"
          style={{ maxWidth: '85vw', maxHeight: '80vh', objectFit: 'contain' }}
        />
      )}
      {currentIdx > 0 && (
        <button className="preview-nav prev" onClick={goPrev} title="Anterior (←)">
          <ChevronLeft size={18} />
        </button>
      )}
      {currentIdx < allPreviewable.length - 1 && (
        <button className="preview-nav next" onClick={goNext} title="Siguiente (→)">
          <ChevronRight size={18} />
        </button>
      )}
      {allPreviewable.length > 1 && (
        <div className="preview-counter">
          {currentIdx + 1} / {allPreviewable.length}
        </div>
      )}
    </div>
  );
}

// ─── Context Menu ──────────────────────────────────────────
export function ContextMenu({ x, y, entry, onClose, onRename, onDelete, onMkdir, onOpen, onPreview, onOpenLocation, sortBy, sortDesc, onSort }: {
  x: number; y: number; entry: FileEntry | null;
  onClose: () => void; onRename: () => void; onDelete: () => void;
  onMkdir: () => void; onOpen: () => void; onPreview: () => void;
  onOpenLocation: () => void;
  sortBy: string; sortDesc: boolean; onSort: (field: string) => void;
}) {
  useEffect(() => {
    const h = () => onClose();
    window.addEventListener('click', h, { once: true });
    return () => window.removeEventListener('click', h);
  }, [onClose]);

  return (
    <motion.div 
      className="context-menu" 
      style={{ left: x, top: y, transformOrigin: 'top left' }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
    >
      {entry && (
        <>
          <div className="context-menu-item" onClick={onOpen}>
            {entry.isDir ? <FolderOpen size={13} /> : <File size={13} />}
            Abrir
          </div>
          {PREVIEWABLE.has(entry.ext) && (
            <div className="context-menu-item accent" onClick={onPreview}>
              <ZoomIn size={13} /> Vista previa
            </div>
          )}
          <div className="context-menu-item" onClick={onOpenLocation}>
            <ExternalLink size={13} /> Abrir origen
          </div>
          <div className="context-menu-sep" />
          <div className="context-menu-item" onClick={onRename}>
            <Edit2 size={13} /> Renombrar
          </div>
          <div className="context-menu-sep" />
          <div className="context-menu-item danger" onClick={onDelete}>
            <Trash2 size={13} /> Eliminar
          </div>
        </>
      )}
      {!entry && (
        <>
          <div className="context-menu-item" onClick={onMkdir}>
            <Plus size={13} /> Nueva carpeta
          </div>
          <div className="context-menu-sep" />
          <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); onSort('name'); }}>
            {sortBy === 'name' ? (sortDesc ? <ArrowDown size={13}/> : <ArrowUp size={13}/>) : <div style={{width:13}}/>} Ordenar por Nombre
          </div>
          <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); onSort('type'); }}>
            {sortBy === 'type' ? (sortDesc ? <ArrowDown size={13}/> : <ArrowUp size={13}/>) : <div style={{width:13}}/>} Ordenar por Tipo
          </div>
          <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); onSort('size'); }}>
            {sortBy === 'size' ? (sortDesc ? <ArrowDown size={13}/> : <ArrowUp size={13}/>) : <div style={{width:13}}/>} Ordenar por Tamaño
          </div>
          <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); onSort('created'); }}>
            {sortBy === 'created' ? (sortDesc ? <ArrowDown size={13}/> : <ArrowUp size={13}/>) : <div style={{width:13}}/>} Ordenar por Creación
          </div>
          <div className="context-menu-item" onClick={(e) => { e.stopPropagation(); onSort('modified'); }}>
            {sortBy === 'modified' ? (sortDesc ? <ArrowDown size={13}/> : <ArrowUp size={13}/>) : <div style={{width:13}}/>} Ordenar por Modificación
          </div>
        </>
      )}
    </motion.div>
  );
}

// ─── Rename Modal ──────────────────────────────────────────
export function RenameModal({ entry, onCancel, onConfirm }: { entry: FileEntry; onCancel: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(entry.name);
  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal" initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
        <div className="modal-title">Renombrar</div>
        <div className="modal-subtitle">Nuevo nombre para "{entry.name}"</div>
        <input className="input" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onConfirm(name)} autoFocus />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onConfirm(name)}>Renombrar</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Delete Modal ──────────────────────────────────────────
export function DeleteModal({ entry, onCancel, onConfirm }: { entry: FileEntry; onCancel: () => void; onConfirm: () => void }) {
  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal" initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={18} color="#ff4444" /> Eliminar
        </div>
        <div className="modal-subtitle">
          ¿Eliminar <strong style={{ color: 'var(--text-primary)' }}>"{entry.name}"</strong>?
          {entry.isDir && ' Esto eliminará toda la carpeta y su contenido.'}
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-danger" onClick={onConfirm}>Eliminar</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Mkdir Modal ───────────────────────────────────────────
export function MkdirModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState('Nueva carpeta');
  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal" initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
        <div className="modal-title">Nueva carpeta</div>
        <div className="modal-subtitle">Ingresa el nombre</div>
        <input className="input" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onConfirm(name)} autoFocus />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onConfirm(name)}>Crear</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Bulk Modals ───────────────────────────────────────────
export function BulkActionModal({ title, subtitle, actionLabel, defaultName = '', onCancel, onConfirm }: { title: string; subtitle: string; actionLabel: string; defaultName?: string; onCancel: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(defaultName);
  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal" initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
        <div className="modal-title">{title}</div>
        <div className="modal-subtitle">{subtitle}</div>
        <input className="input" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onConfirm(name)} autoFocus />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onConfirm(name)}>{actionLabel}</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function BulkMoveModal({ title, subtitle, currentPath, onCancel, onConfirm }: { title: string; subtitle: string; currentPath: string; onCancel: () => void; onConfirm: (dest: string) => void }) {
  const [dest, setDest] = useState(currentPath);
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">{title}</div>
        <div className="modal-subtitle">{subtitle}</div>
        <input className="input" value={dest} onChange={e => setDest(e.target.value)} onKeyDown={e => e.key === 'Enter' && onConfirm(dest)} autoFocus />
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onConfirm(dest)}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}

export function BulkDeleteModal({ count, onCancel, onConfirm }: { count: number; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={18} color="#ff4444" /> Eliminar Múltiples
        </div>
        <div className="modal-subtitle">
          ¿Estás seguro de eliminar <strong style={{ color: 'var(--text-primary)' }}>{count} elementos</strong> definitivamente? Esta acción no se puede deshacer.
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-danger" onClick={onConfirm}>Sí, eliminar {count}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Organize Modal ────────────────────────────────────────
export function OrganizeModal({ currentPath, onClose, toast }: {
  currentPath: string; onClose: () => void;
  toast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [preview, setPreview] = useState<OrganizePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [executed, setExecuted] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch('/api/organize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourcePath: currentPath, preview: true }) })
      .then(r => r.json()).then(d => { setPreview(d); setLoading(false); });
  }, [currentPath]);

  const execute = async () => {
    setLoading(true);
    const res = await fetch('/api/organize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourcePath: currentPath, preview: false, execute: true }) });
    const data = await res.json();
    if (data.success) { setExecuted(true); toast(`${data.moved} archivos organizados`); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wand2 size={18} color="var(--accent)" /> Auto-Organizador
            </div>
            <div className="modal-subtitle">Agrupa los archivos por tipo automáticamente</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={15} /></button>
        </div>
        {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>}
        {!loading && executed && (
          <div style={{ textAlign: 'center', padding: '28px 0' }}>
            <CheckCircle size={44} color="var(--accent)" style={{ margin: '0 auto 12px', display: 'block', filter: 'drop-shadow(0 0 12px rgba(14,201,0,0.4))' }} />
            <div style={{ fontWeight: 700, marginBottom: 4 }}>¡Carpeta organizada!</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{preview?.moves.length} archivos movidos a sus carpetas.</div>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onClose}>Cerrar</button>
          </div>
        )}
        {!loading && !executed && preview && (
          <>
            {preview.moves.length === 0
              ? <div className="empty-state"><CheckCircle size={28} color="var(--accent)" /><span>Esta carpeta ya está organizada</span></div>
              : <>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 4 }}>
                    Se moverán <strong style={{ color: 'var(--accent)' }}>{preview.moves.length}</strong> archivos:
                  </div>
                  <div className="organize-list">
                    {preview.moves.map((m, i) => {
                      const dest = m.to.replace(currentPath, '').split('\\')[1] || '';
                      return (
                        <div className="organize-item" key={i}>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                          <ArrowRight size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                          <span style={{ color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 11 }}>{dest}/</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="modal-actions">
                    <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={execute}><Wand2 size={13} /> Organizar ahora</button>
                  </div>
                </>
            }
          </>
        )}
      </div>
    </div>
  );
}

// ─── Stats Panel ───────────────────────────────────────────
export function StatsPanel({ path, onClose }: { path: string; onClose: () => void }) {
  const [stats, setStats] = useState<DiskStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?path=${encodeURIComponent(path)}`).then(r => r.json()).then(d => { setStats(d); setLoading(false); });
  }, [path]);

  const COLORS = ['#0EC900','#00c8a0','#3FFF00','#00a8ff','#ff9900','#ff4488','#b44fff','#00e5ff'];

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 580 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={18} color="var(--accent)" /> Estadísticas de Disco
            </div>
            <div className="modal-subtitle" style={{ marginBottom: 0, wordBreak: 'break-all', fontSize: 12 }}>{path}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={15} /></button>
        </div>
        {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>}
        {!loading && stats && (
          <div style={{ overflow: 'auto', maxHeight: '68vh' }}>
            <div className="stats-grid">
              <div className="stat-card"><div className="stat-card-label">Tamaño total</div><div className="stat-card-value">{formatSize(stats.totalSize)}</div></div>
              <div className="stat-card"><div className="stat-card-label">Archivos</div><div className="stat-card-value">{stats.fileCount.toLocaleString()}</div></div>
              <div className="stat-card"><div className="stat-card-label">Carpetas</div><div className="stat-card-value">{stats.dirCount.toLocaleString()}</div></div>
            </div>
            <div className="stats-section-title">Distribución por tipo</div>
            {Object.entries(stats.byType).sort(([,a],[,b]) => b.size - a.size).slice(0, 8).map(([ext, data], i) => {
              const pct = stats.totalSize > 0 ? (data.size / stats.totalSize) * 100 : 0;
              return (
                <div className="type-bar" key={ext}>
                  <div className="type-bar-header">
                    <span style={{ textTransform: 'uppercase', fontWeight: 700, fontSize: 11 }}>
                      .{ext} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({data.count})</span>
                    </span>
                    <span>{formatSize(data.size)}</span>
                  </div>
                  <div className="type-bar-track">
                    <div className="type-bar-fill" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              );
            })}
            <div className="stats-section-title">Top 10 archivos más grandes</div>
            {stats.topFiles.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{f.name}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
