'use client';
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useDeferredValue, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder, File, Image, Film, Music, FileText, Archive, Code, HardDrive,
  Search, Grid, List, ChevronRight, HomeIcon, ArrowLeft, ArrowUp, ArrowDown, Plus,
  Trash2, Trash, Edit2, RefreshCw, BarChart2, Wand2, X, CheckCircle, AlertCircle, 
  Terminal, Monitor, Type, AlertTriangle, ArrowRight, Play, ZoomIn, ChevronLeft,
  Pause, Volume2, VolumeX, SkipBack, SkipForward, Maximize, FolderOpen, FileArchive,
  FolderPlus, MoveRight, Copy, CheckSquare, Square, ExternalLink, Info, Check, Tag, Palette,
  Sparkles, Loader, Cpu, Wifi, WifiOff, ChevronDown, Package
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

// ─── Animated Trash Icon ─────────────────────────────────────
export function AnimatedTrashIcon({ count, size = 14 }: { count: number, size?: number }) {
  const fillRatio = Math.max(0, Math.min(count / 10, 1));
  const isFilled = count > 0;
  
  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex' }}>
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        style={{ color: isFilled ? 'var(--danger)' : 'currentColor' }}
      >
        {/* Trash outline and inner lines drawn first */}
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />

        {/* The solid fill drawn on top to physically cover the lines as it fills */}
        <motion.rect
          x="8"
          width="8"
          fill="currentColor"
          stroke="none"
          initial={false}
          animate={{ 
            height: fillRatio * 12,
            y: 20 - (fillRatio * 12)
          }}
          transition={{ type: 'spring', bounce: 0.5, damping: 12 }}
        />
      </svg>
    </div>
  );
}

// ─── Inline Rename Component ─────────────────────────────────
export function InlineRenameInput({ entry, onConfirm, onCancel }: { entry: FileEntry, onConfirm: (path: string, newName: string) => void, onCancel: () => void }) {
  const [name, setName] = useState(entry.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmedRef = useRef(false); // prevent double-fire from Enter + blur

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

  const confirm = (value: string) => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    onConfirm(entry.path, value);
  };

  const cancel = () => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    onCancel();
  };

  return (
    <input
      ref={inputRef}
      value={name}
      onChange={e => setName(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); confirm(name); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      }}
      onBlur={() => confirm(name)}
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
      {selected && <Check size={16} color="#4ade80" strokeWidth={3} />}
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

  const thumbUrl = `/api/image-thumb?path=${encodeURIComponent(entry.path)}`;

  if (!entry.isDir && isImage && !imgError) {
    return (
      <div className="file-thumb" style={{ width: size, height: size }}>
        <img src={thumbUrl} alt={entry.name} onError={() => setImgError(true)} loading="lazy" />
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

  const thumbUrl = `/api/image-thumb?path=${encodeURIComponent(entry.path)}`;

  if (!entry.isDir && isImage && !imgError) {
    return (
      <div className="file-list-icon" style={{ background: 'transparent' }}>
        <img src={thumbUrl} alt="" onError={() => setImgError(true)} loading="lazy"
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
  const [muted, setMuted] = useState(true);
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
    const newMuted = !muted;
    v.muted = newMuted;
    setMuted(newMuted);
    if (!newMuted && volume === 0) { v.volume = 0.8; setVolume(0.8); }
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
        muted={muted}
        onTimeUpdate={e => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={e => { setDuration(e.currentTarget.duration); }}
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
export function ContextMenu({ x, y, entry, onClose, onRename, onDelete, onMkdir, onOpen, onPreview, onOpenLocation, onMoveTo, onUnzip, onMetadata, sortBy, sortDesc, onSort, aeLinkedProjects, onOpenAEProject, onPackProject }: {
  x: number; y: number; entry: FileEntry | null;
  onClose: () => void; onRename: () => void; onDelete: () => void;
  onMkdir: () => void; onOpen: () => void; onPreview: () => void;
  onOpenLocation: () => void; onMoveTo: () => void; onUnzip: () => void;
  onMetadata: () => void;
  sortBy: string; sortDesc: boolean; onSort: (field: string) => void;
  aeLinkedProjects?: string[];
  onOpenAEProject?: (path: string) => void;
  onPackProject?: (path: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => {
    const h = () => onClose();
    window.addEventListener('click', h, { once: true });
    return () => window.removeEventListener('click', h);
  }, [onClose]);

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    let newLeft = x;
    let newTop = y;
    
    if (newLeft + rect.width > vw - 10) newLeft = vw - rect.width - 10;
    if (newTop + rect.height > vh - 10) newTop = vh - rect.height - 10;
    
    setPos({ left: Math.max(10, newLeft), top: Math.max(10, newTop) });
  }, [x, y]);

  return (
    <motion.div 
      ref={menuRef}
      className="context-menu" 
      style={{ left: pos.left, top: pos.top, transformOrigin: 'top left' }}
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
          {entry.ext === 'zip' && (
            <div className="context-menu-item" onClick={onUnzip}>
              <FileArchive size={13} /> Extraer Aquí
            </div>
          )}
          {entry.ext === 'aep' && (
            <div className="context-menu-item accent" onClick={() => onPackProject && onPackProject(entry.path)}>
              <Package size={13} /> Empaquetar Proyecto
            </div>
          )}
          <div className="context-menu-sep" />
          <div className="context-menu-item" onClick={onRename}>
            <Edit2 size={13} /> Renombrar
          </div>
          <div className="context-menu-item" onClick={onMetadata}>
            <Tag size={13} /> Etiquetas y Color
          </div>
          <div className="context-menu-item" onClick={e => { e.stopPropagation(); onMoveTo(); }}>
            <MoveRight size={13} /> Mover a…
          </div>
          <div className="context-menu-sep" />
          <div className="context-menu-item danger" onClick={onDelete}>
            <Trash2 size={13} /> Eliminar
          </div>
          <div className="context-menu-sep" />
          
          {aeLinkedProjects && aeLinkedProjects.length > 0 && (
            <>
              <div className="context-menu-section-label" style={{ color: '#c4b5fd' }}>🎬 Usado en After Effects</div>
              {aeLinkedProjects.map((projPath, i) => {
                const parts = projPath.split(/[\\/]/);
                const projName = parts[parts.length - 1];
                return (
                  <div key={i} className="context-menu-item" style={{ fontSize: 11 }} onClick={() => onOpenAEProject && onOpenAEProject(projPath)} title={projPath}>
                    <ExternalLink size={11} /> {projName}
                  </div>
                );
              })}
              <div className="context-menu-sep" />
            </>
          )}
        </>
      )}
      {!entry && (
        <>
          <div className="context-menu-item" onClick={onMkdir}>
            <Plus size={13} /> Nueva carpeta
          </div>
          <div className="context-menu-sep" />
        </>
      )}
      {/* Sort section — always visible regardless of entry */}
      <div className="context-menu-section-label">Ordenar por</div>
      {(['name','type','size','created','modified'] as const).map((field) => {
        const labels: Record<string, string> = { name: 'Nombre', type: 'Tipo', size: 'Tamaño', created: 'Creación', modified: 'Modificado' };
        const active = sortBy === field;
        return (
          <div
            key={field}
            className={`context-menu-item ${active ? 'accent' : ''}`}
            onClick={(e) => { e.stopPropagation(); onSort(field); }}
          >
            {active ? (sortDesc ? <ArrowDown size={13}/> : <ArrowUp size={13}/>) : <div style={{ width: 13 }}/>}
            {labels[field]}
            {active && <span style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>{sortDesc ? '↓ Z→A' : '↑ A→Z'}</span>}
          </div>
        );
      })}
    </motion.div>
  );
}

// ─── Move To Modal ─────────────────────────────────────────
const QUICK_FOLDERS = [
  { label: 'Escritorio',  path: `${typeof window !== 'undefined' ? '' : 'C:\\Users\\Public'}`, id: 'desktop' },
  { label: 'Descargas',   path: '', id: 'downloads' },
  { label: 'Documentos',  path: '', id: 'documents' },
  { label: 'Imágenes',    path: '', id: 'pictures' },
  { label: 'Videos',      path: '', id: 'videos' },
  { label: 'Música',      path: '', id: 'music' },
];

export function MoveToModal({ sourcePaths, onConfirm, onCancel }: {
  sourcePaths: string[];
  onConfirm: (destPath: string) => void;
  onCancel: () => void;
}) {
  const [browsePath, setBrowsePath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [quickAccess, setQuickAccess] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  // Load quick access on mount
  useEffect(() => {
    fetch('/api/fs/drives')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.quickAccess) setQuickAccess(data.quickAccess); });
  }, []);

  const loadDir = async (path: string) => {
    if (!path) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/fs?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setEntries((data.entries || []).filter((e: FileEntry) => e.isDir));
        setBrowsePath(path);
      }
    } finally { setLoading(false); }
  };

  const navigate = (path: string) => {
    setHistory(prev => browsePath ? [...prev, browsePath] : prev);
    loadDir(path);
  };

  const goBack = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(h => h.slice(0, -1));
    loadDir(prev);
  };

  const goUp = () => {
    if (!browsePath || browsePath.length <= 3) return;
    const parent = browsePath.substring(0, browsePath.lastIndexOf('\\')) || browsePath.substring(0, 3);
    navigate(parent);
  };

  // Breadcrumb parts
  const parts = browsePath ? browsePath.split('\\').filter(Boolean) : [];

  const isSourceParent = sourcePaths.some(sp => {
    const spParent = sp.substring(0, sp.lastIndexOf('\\'));
    return spParent === browsePath;
  });

  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <motion.div className="modal moveto-modal" initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MoveRight size={16} /> Mover a…
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
            {sourcePaths.length} {sourcePaths.length === 1 ? 'elemento' : 'elementos'}
          </span>
        </div>

        <div className="moveto-layout">
          {/* Left: quick access */}
          <div className="moveto-sidebar">
            <div className="moveto-sidebar-title">Accesos rápidos</div>
            {quickAccess.map(qa => (
              <button key={qa.path} className={`moveto-quick-item ${browsePath === qa.path ? 'active' : ''}`}
                onClick={() => navigate(qa.path)}>
                <FolderOpen size={13} /> {qa.name}
              </button>
            ))}
          </div>

          {/* Right: folder browser */}
          <div className="moveto-browser">
            {/* Nav row */}
            <div className="moveto-nav">
              <button className="btn btn-ghost btn-icon" onClick={goBack} disabled={history.length === 0} style={{ padding: '2px 5px' }}>
                <ArrowLeft size={14} />
              </button>
              <button className="btn btn-ghost btn-icon" onClick={goUp} disabled={!browsePath || browsePath.length <= 3} style={{ padding: '2px 5px' }}>
                <ArrowUp size={14} />
              </button>
              {/* Breadcrumb */}
              <div className="moveto-breadcrumb">
                {parts.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Seleccioná una carpeta</span>}
                {parts.map((part, i) => {
                  const partPath = parts.slice(0, i + 1).join('\\') + (i === 0 ? '\\' : '');
                  return (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {i > 0 && <ChevronRight size={11} style={{ opacity: 0.4 }} />}
                      <button className="moveto-breadcrumb-btn" onClick={() => navigate(partPath)}>{part}</button>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Folder list */}
            <div className="moveto-entries">
              {loading && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Cargando…</div>}
              {!loading && !browsePath && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Elegí un acceso rápido o navegá</div>}
              {!loading && browsePath && entries.length === 0 && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Sin subcarpetas</div>}
              {entries.map(e => (
                <button key={e.path} className="moveto-folder-item" onDoubleClick={() => navigate(e.path)} onClick={() => setBrowsePath(e.path)}>
                  <Folder size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{e.name}</span>
                  <ArrowRight size={11} style={{ opacity: 0.3, flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-actions" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, marginTop: 0 }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={!browsePath || isSourceParent}
            onClick={() => onConfirm(browsePath)}
            title={isSourceParent ? 'El archivo ya está en esta carpeta' : ''}
          >
            <MoveRight size={14} /> Mover aquí
          </button>
        </div>
      </motion.div>
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

// ─── Stats Charts ──────────────────────────────────────────────────────────

function DonutChart({ segments, size = 220, strokeWidth = 32 }: { segments: any[], size?: number, strokeWidth?: number }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const R = (size / 2) - strokeWidth;
  const circumference = 2 * Math.PI * R;
  const cx = size / 2, cy = size / 2;
  
  let currentOffset = 0;
  const renderedSegments = segments.map(seg => {
    const dash = (seg.pct / 100) * circumference;
    const offset = currentOffset;
    currentOffset += dash;
    return { ...seg, dash, offset };
  });

  const activeSegment = hoveredIdx !== null ? renderedSegments[hoveredIdx] : null;

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={strokeWidth} />
        {renderedSegments.map((seg, i) => (
          <motion.circle key={i} cx={cx} cy={cy} r={R}
            fill="none" stroke={seg.color} strokeWidth={strokeWidth}
            strokeDashoffset={-seg.offset}
            strokeLinecap="round"
            initial={{ strokeDasharray: `0 ${circumference}` }}
            animate={{ strokeDasharray: `${Math.max(0, seg.dash - 2)} ${circumference - Math.max(0, seg.dash - 2)}` }}
            transition={{ duration: 0.9, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{ 
              cursor: 'pointer', 
              opacity: hoveredIdx !== null && hoveredIdx !== i ? 0.3 : 1, 
              transition: 'opacity 0.2s',
              filter: hoveredIdx === i ? `drop-shadow(0 0 6px ${seg.color}88)` : 'none'
            }}
          />
        ))}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <AnimatePresence mode="wait">
          {activeSegment ? (
            <motion.div 
              key="active"
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
            >
              {activeSegment.label !== 'sin extensión' && (
                <img 
                  src={`https://api.iconify.design/vscode-icons:file-type-${activeSegment.label}.svg`} 
                  style={{ width: 42, height: 42, marginBottom: 4 }}
                  onError={(e) => { e.currentTarget.src = 'https://api.iconify.design/vscode-icons:default-file.svg'; }}
                  alt=""
                />
              )}
              <div style={{ color: activeSegment.color, fontWeight: 700, fontSize: 16 }}>.{activeSegment.label}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{formatSize(activeSegment.size)} ({activeSegment.count})</div>
            </motion.div>
          ) : (
            <motion.div 
              key="default"
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}
            >
              Distribución
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}



// ─── Stats Panel ───────────────────────────────────────────
export function StatsPanel({ path, onClose, renderGridCard }: { path: string; onClose: () => void; renderGridCard?: (entry: any, forceCover?: boolean) => React.ReactNode }) {
  const [stats, setStats] = useState<DiskStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/stats?path=${encodeURIComponent(path)}`).then(r => r.json()).then(d => { setStats(d); setLoading(false); });
  }, [path]);

  // Vibrant premium palette (Tailwind 500s) for better distinction
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  const segments = stats ? Object.entries(stats.byType)
    .sort(([,a],[,b]) => b.size - a.size)
    .slice(0, 8)
    .map(([ext, data], i) => ({
      label: ext,
      size: data.size,
      count: data.count,
      pct: (data.size / stats.totalSize) * 100,
      color: COLORS[i % COLORS.length]
    })) : [];

  const topFilesData = stats ? stats.topFiles.map((f, i) => ({
    name: f.name,
    value: f.size,
    color: COLORS[i % COLORS.length]
  })) : [];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  
  const itemVariants = {
    hidden: { opacity: 0, y: 15, scale: 0.95 },
    show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 400, damping: 24 } }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 800 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={18} color="var(--accent)" /> Dashboard de Almacenamiento
            </div>
            <div className="modal-subtitle" style={{ marginBottom: 0, wordBreak: 'break-all', fontSize: 12 }}>{path}</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={15} /></button>
        </div>
        
        {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><div className="spinner" /></div>}
        
        {!loading && stats && (
          <motion.div variants={containerVariants} initial="hidden" animate="show" style={{ overflow: 'auto', maxHeight: '85vh', paddingRight: 8 }}>
            
            <motion.div variants={itemVariants} className="stats-grid" style={{ marginBottom: 32 }}>
              <div className="stat-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="stat-card-label">Tamaño Total</div>
                <div className="stat-card-value" style={{ color: 'var(--accent)' }}>{formatSize(stats.totalSize)}</div>
              </div>
              <div className="stat-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="stat-card-label">Total de Archivos</div>
                <div className="stat-card-value">{stats.fileCount.toLocaleString()}</div>
              </div>
              <div className="stat-card" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="stat-card-label">Carpetas</div>
                <div className="stat-card-value">{stats.dirCount.toLocaleString()}</div>
              </div>
            </motion.div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 48, alignItems: 'center', width: '100%', paddingBottom: 20 }}>
              <motion.div variants={itemVariants} style={{ width: '100%' }}>
                <div className="stats-section-title" style={{ textAlign: 'center', marginBottom: 16 }}>Distribución por Tipo</div>
                <DonutChart segments={segments} size={320} strokeWidth={44} />
              </motion.div>
              
              {renderGridCard && stats.topFiles.length > 0 && (
                <motion.div variants={itemVariants} style={{ width: '100%' }}>
                  <div className="stats-section-title" style={{ textAlign: 'center', marginBottom: 24, borderTop: '1px solid var(--border-subtle)', paddingTop: 32 }}>
                    Top 10 Archivos Más Pesados
                  </div>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                    gap: 16, 
                    padding: '12px 4px'
                  }}>
                    {stats.topFiles.map((file, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <div style={{
                          position: 'absolute', top: -10, left: -10, width: 28, height: 28,
                          background: i === 0 ? 'var(--accent)' : 'var(--bg-elevated)',
                          color: i === 0 ? '#000' : 'var(--text-primary)',
                          border: `1px solid ${i === 0 ? 'transparent' : 'var(--border-subtle)'}`,
                          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: 13, zIndex: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                        }}>
                          {i + 1}
                        </div>
                        {renderGridCard(file, true)}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>

          </motion.div>
        )}
      </div>
    </div>
  );
}

// ─── Trash Modal ────────────────────────────────────────────
const TRASH_IMG_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','svg','ico','heic','tiff']);
const TRASH_VID_EXTS = new Set(['mp4','webm','mov','avi','mkv','wmv','m4v']);

function TrashThumb({ item }: { item: any }) {
  const ext = (item.ext || '').toLowerCase();
  const src = `/api/preview?path=${encodeURIComponent(item.trashPath)}`;

  if (TRASH_IMG_EXTS.has(ext)) {
    return (
      <div style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </div>
    );
  }
  if (TRASH_VID_EXTS.has(ext)) {
    return (
      <div style={{ width: 44, height: 44, flexShrink: 0, position: 'relative' }}>
        <VideoThumb src={src} size={44} mini={true} cover={true} />
      </div>
    );
  }
  if (item.isDir) {
    return (
      <div style={{ width: 44, height: 44, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
        <Folder size={22} style={{ color: 'var(--accent)' }} />
      </div>
    );
  }
  // Generic file icon colored by type
  const typeColors: Record<string, string> = {
    pdf: '#e74c3c', psd: '#31a8ff', zip: '#f39c12', rar: '#f39c12',
    doc: '#2b579a', docx: '#2b579a', xls: '#217346', xlsx: '#217346',
    mp3: '#1db954', wav: '#1db954', txt: '#aaa', js: '#f7df1e',
  };
  const color = typeColors[ext] || 'var(--text-muted)';
  return (
    <div style={{ width: 44, height: 44, borderRadius: 6, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', gap: 1 }}>
      <File size={18} style={{ color }} />
      {ext && <span style={{ fontSize: 8, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{ext}</span>}
    </div>
  );
}

export function TrashModal({ onClose, onRestore, toast }: {
  onClose: () => void;
  onRestore: () => void;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [emptying, setEmptying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fs/trash');
      if (res.ok) { const d = await res.json(); setItems(d.items || []); }
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleRestore = async (item: any) => {
    try {
      await fetch('/api/fs/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo', undoAction: { type: 'delete', items: [{ originalPath: item.originalPath, trashPath: item.trashPath }] } })
      });
      toast('Archivo restaurado', 'success');
      onRestore();
      load();
    } catch { toast('Error al restaurar', 'error'); }
  };

  const handleEmptyTrash = async () => {
    setEmptying(true);
    try {
      const res = await fetch('/api/fs/empty-trash', { method: 'POST' });
      if (res.ok) { toast('Papelera vaciada', 'success'); setItems([]); onRestore(); }
      else toast('Error al vaciar', 'error');
    } finally { setEmptying(false); }
  };

  const openTrashFolder = () => {
    fetch('/api/fs/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'open-location', path: items[0]?.trashPath || '' })
    });
  };

  const totalSize = items.reduce((s, i) => s + (i.size || 0), 0);

  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div className="modal" style={{ maxWidth: 600 }}
        initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, flex: 1 }}>
            <Trash size={16} style={{ color: 'var(--danger)' }} /> Papelera
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {items.length > 0 && (
              <button className="btn btn-ghost btn-icon" title="Abrir carpeta de papelera en el Explorador"
                onClick={openTrashFolder} style={{ padding: '4px 7px', fontSize: 11, gap: 5 }}>
                <FolderOpen size={13} /> Ver carpeta
              </button>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {items.length} {items.length === 1 ? 'elemento' : 'elementos'}
              {totalSize > 0 && <> · {formatSize(totalSize)}</>}
            </span>
          </div>
        </div>

        {/* List */}
        <div style={{ minHeight: 200, maxHeight: 400, overflowY: 'auto', margin: '14px -4px 0', padding: '0 4px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Cargando…</div>
          )}
          {!loading && items.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Trash size={36} style={{ opacity: 0.15 }} />
              <div style={{ fontSize: 13 }}>La papelera está vacía</div>
            </div>
          )}
          {items.map((item, i) => (
            <motion.div key={item.trashPath || i}
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 6px', borderBottom: '1px solid var(--border-subtle)', borderRadius: 6 }}
              className="trash-item-row"
            >
              <TrashThumb item={item} />
              <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                  {item.name || 'Archivo desconocido'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 10, marginTop: 2 }}>
                  <span>{item.isDir ? 'Carpeta' : (item.ext ? item.ext.toUpperCase() : 'Archivo')}</span>
                  {item.size > 0 && <span>{formatSize(item.size)}</span>}
                  {item.deletedAt && <span>{new Date(item.deletedAt).toLocaleDateString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
                onClick={() => handleRestore(item)}>
                Restaurar
              </button>
            </motion.div>
          ))}
        </div>

        {/* Footer */}
        <div className="modal-actions" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12, marginTop: 12 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          {items.length > 0 && (
            <button className="btn btn-ghost" style={{ color: 'var(--danger)' }}
              onClick={handleEmptyTrash} disabled={emptying}>
              <Trash2 size={13} /> {emptying ? 'Vaciando…' : 'Vaciar papelera'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Metadata Modal ─────────────────────────────────────────
export function MetadataModal({
  entry, onClose, onSave
}: {
  entry: FileEntry;
  onClose: () => void;
  onSave: (color: string | null, tags: string[]) => void;
}) {
  const [color, setColor] = useState<string | null>(entry.color || null);
  const [tagsStr, setTagsStr] = useState<string>(entry.tags ? entry.tags.join(', ') : '');

  const handleSave = () => {
    const parsedTags = tagsStr.split(',').map(s => s.trim()).filter(Boolean);
    onSave(color, parsedTags);
    onClose();
  };

  const COLORS = [
    { label: 'Rojo', value: '#ff4444' },
    { label: 'Naranja', value: '#ff9800' },
    { label: 'Amarillo', value: '#ffeb3b' },
    { label: 'Verde', value: '#0EC900' },
    { label: 'Azul', value: '#2196f3' },
    { label: 'Morado', value: '#9c27b0' },
  ];

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="modal" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Tag size={20} className="accent-text" />
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Etiquetas y Color</h2>
        </div>

        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
          Editando: <strong style={{ color: 'var(--text-primary)' }}>{entry.name}</strong>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>COLOR</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-ghost"
              style={{ width: 32, height: 32, padding: 0, borderRadius: '50%', border: color === null ? '2px solid var(--accent)' : '2px solid transparent' }}
              onClick={() => setColor(null)}
              title="Sin color"
            >
              <X size={16} />
            </button>
            {COLORS.map(c => (
              <button
                key={c.value}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: c.value,
                  boxShadow: color === c.value ? `0 0 0 3px var(--bg-surface), 0 0 0 5px ${c.value}` : 'none',
                }}
                onClick={() => setColor(c.value)}
                title={c.label}
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, marginBottom: 8, color: 'var(--text-muted)' }}>ETIQUETAS (separadas por coma)</label>
          <input
            className="input"
            value={tagsStr}
            onChange={e => setTagsStr(e.target.value)}
            placeholder="ej. vacaciones, familia, importante"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') onClose();
            }}
          />
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>Guardar</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Duplicate Finder View ─────────────────────────────────────────
export function DuplicateView({
  cwd, onClose, onSuccess, onOpenLocation
}: {
  cwd: string;
  onClose: () => void;
  onSuccess: () => void;
  onOpenLocation?: (path: string) => void;
}) {
  const [duplicates, setDuplicates] = useState<{ hash: string; files: { path: string; size: number }[] }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [progressMsg, setProgressMsg] = useState('Iniciando...');
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const { show: toast } = useToast();

  const toggleGroup = (ext: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(ext)) next.delete(ext);
      else next.add(ext);
      return next;
    });
  };

  const groupedDuplicates = useMemo(() => {
    if (!duplicates) return null;
    const groups: Record<string, typeof duplicates> = {};
    for (const group of duplicates) {
      const name = group.files[0].path.split(/[\\/]/).pop() || '';
      const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || 'sin extensión' : 'sin extensión';
      if (!groups[ext]) groups[ext] = [];
      groups[ext].push(group);
    }
    return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)));
  }, [duplicates]);

  useEffect(() => {
    let active = true;
    const es = new EventSource(`/api/fs/duplicates?path=${encodeURIComponent(cwd)}`);
    
    es.onmessage = (e) => {
      if (!active) return;
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'progress') {
          setProgressMsg(data.message);
          if (data.total > 0) {
            setProgressPct(Math.round((data.processed / data.total) * 100));
          } else {
            setProgressPct(null);
          }
        } else if (data.type === 'result') {
          const results = data.duplicates || [];
          setDuplicates(results);
          // Start with all groups collapsed
          const allExts = new Set<string>(results.map((g: any) => {
            const name = g.files[0].path.split(/[\/\\]/).pop() || '';
            return name.includes('.') ? name.split('.').pop()?.toLowerCase() || 'sin extensión' : 'sin extensión';
          }));
          setCollapsedGroups(allExts);
          setLoading(false);
          es.close();
        } else if (data.type === 'error') {
          setLoading(false);
          toast(data.message || 'Error', 'error');
          es.close();
        }
      } catch (err) {}
    };

    es.onerror = () => {
      if (active && loading) {
        setLoading(false);
        toast('Error de conexión con el servidor', 'error');
      }
      es.close();
    };

    return () => { active = false; es.close(); };
  }, [cwd, toast]);

  const handleDelete = async (pathsToKeep: string[], groupFiles: string[]) => {
    const toDelete = groupFiles.filter(f => !pathsToKeep.includes(f));
    if (toDelete.length === 0) return;
    
    setDeleting(true);
    try {
      const res = await fetch('/api/fs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', paths: toDelete })
      });
      if (!res.ok) throw new Error('Delete failed');
      
      // Remove group from UI
      setDuplicates(prev => prev ? prev.filter(g => !g.files.some(f => toDelete.includes(f.path))) : null);
      toast(`${toDelete.length} duplicado(s) eliminado(s)`, 'success');
      onSuccess();
    } catch {
      toast('Error al eliminar duplicados', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: 20 }} 
      style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Copy size={24} className="accent-text" />
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Buscador de Duplicados</h2>
      </div>

      <div style={{ marginBottom: 24, fontSize: 14, color: 'var(--text-secondary)' }}>
        Escaneando: <strong style={{ color: 'var(--text-primary)' }}>{cwd}</strong>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8, margin: '0 -8px', paddingLeft: 8 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <div style={{ marginBottom: 12 }}>{progressMsg}</div>
              {progressPct !== null && (
                <div style={{ width: '100%', height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: `${progressPct}%` }} 
                    style={{ height: '100%', background: 'var(--accent)' }} 
                  />
                </div>
              )}
            </div>
          )}
          
          {!loading && duplicates && duplicates.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--accent)' }}>
              ¡Genial! No se encontraron archivos duplicados.
            </div>
          )}

          {!loading && groupedDuplicates && Object.entries(groupedDuplicates).map(([ext, extGroups]) => {
            const isCollapsed = collapsedGroups.has(ext);
            const totalFiles = extGroups.reduce((s, g) => s + g.files.length, 0);
            return (
            <div key={ext} style={{ marginBottom: 16, border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden' }}>
              <button
                onClick={() => toggleGroup(ext)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-surface)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <motion.div animate={{ rotate: isCollapsed ? -90 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronRight size={15} style={{ color: 'var(--text-muted)' }} />
                </motion.div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>
                  {ext === 'sin extensión' ? 'Sin extensión' : `.${ext}`}
                </span>
                <span className="badge" style={{ marginRight: 4 }}>{extGroups.length} {extGroups.length === 1 ? 'grupo' : 'grupos'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{totalFiles} archivos</span>
              </button>
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10, alignItems: 'start' }}>
                {extGroups.map((group, i) => (
                  <div key={group.hash} style={{ background: 'var(--bg-surface)', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>SHA-256: {group.hash.substring(0, 16)}...</span>
                      <span className="badge">{formatSize(group.files[0].size)} c/u</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {group.files.map(f => {
                        const parts = f.path.split(/[\\/]/);
                        const name = parts[parts.length - 1];
                        const fExt = name.split('.').pop()?.toLowerCase() || '';
                        const mockEntry: FileEntry = { path: f.path, name, ext: fExt, isDir: false, size: f.size, modified: '', created: '' };
                        return (
                          <div key={f.path} style={{ fontSize: 12, padding: '4px 8px', background: 'var(--bg-elevated)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 20, height: 20 }}>
                              <FileListIcon entry={mockEntry} />
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={name}>{name}</span>
                              <span style={{ fontSize: 9.5, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.path}>
                                {f.path.startsWith(cwd) ? f.path.substring(cwd.length).replace(/^[\\/]+/, '') : f.path}
                              </span>
                            </div>
                            <button 
                              className="btn btn-ghost btn-icon" 
                              title="Ver en carpeta"
                              style={{ width: 20, height: 20, padding: 0 }}
                              onClick={() => onOpenLocation && onOpenLocation(f.path)}
                            >
                              <ExternalLink size={12} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                      <button 
                        className="btn btn-ghost" 
                        style={{ color: 'var(--danger)', fontSize: 11, padding: '4px 8px' }}
                        disabled={deleting}
                        onClick={() => handleDelete([group.files[0].path], group.files.map(f => f.path))}
                      >
                        <Trash2 size={12} /> Mantener 1 y borrar el resto
                      </button>
                    </div>
                  </div>
                 ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            );
          })}
      </div>

      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={onClose}>Cerrar Buscador</button>
      </div>
    </motion.div>
  );
}

// ─── AI Status Bar ────────────────────────────────────────────────────────────
export function AIStatusBar({ onClick }: { onClick: () => void }) {
  const [status, setStatus] = useState<{ available: boolean; modelAvailable?: boolean; error?: string } | null>(null);

  useEffect(() => {
    fetch('/api/ai/status').then(r => r.json()).then(setStatus).catch(() => setStatus({ available: false }));
  }, []);

  if (!status) return null;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
        borderRadius: 20, border: `1px solid ${status.available && status.modelAvailable ? 'var(--accent)' : 'var(--border-subtle)'}`,
        background: 'transparent', cursor: 'pointer', fontSize: 11,
        color: status.available && status.modelAvailable ? 'var(--accent)' : 'var(--text-muted)',
      }}
      title={status.available ? (status.modelAvailable ? 'IA lista' : 'Modelo no descargado') : (status.error || 'Ollama no disponible')}
    >
      {status.available && status.modelAvailable
        ? <><Cpu size={11} /> IA Lista</>
        : <><WifiOff size={11} /> IA Offline</>}
    </button>
  );
}

// ─── AI Tag Modal ─────────────────────────────────────────────────────────────
export function AITagModal({
  entries,
  onClose,
  onTagsSaved,
}: {
  entries: FileEntry[];
  onClose: () => void;
  onTagsSaved: (path: string, tags: string[]) => void;
}) {
  type TagResult = { path: string; name: string; tags: string[]; description: string; status: 'pending' | 'processing' | 'done' | 'error'; error?: string };

  const [results, setResults] = useState<TagResult[]>(
    entries.map(e => ({ path: e.path, name: e.name, tags: [], description: '', status: 'pending' }))
  );
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [ollamaStatus, setOllamaStatus] = useState<{ available: boolean; modelAvailable?: boolean } | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [newTag, setNewTag] = useState('');
  const { show: toast } = useToast();

  useEffect(() => {
    fetch('/api/ai/status').then(r => r.json()).then(setOllamaStatus);
  }, []);

  const runTagging = async () => {
    setRunning(true);
    for (let i = 0; i < results.length; i++) {
      setCurrent(i);
      setResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'processing' } : r));
      try {
        const res = await fetch('/api/ai/tag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: results[i].path }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, tags: data.tags || [], description: data.description || '', status: 'done' } : r
        ));
      } catch (err: any) {
        setResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, status: 'error', error: err.message } : r
        ));
      }
    }
    setCurrent(-1);
    setRunning(false);
  };

  const saveAll = () => {
    const done = results.filter(r => r.status === 'done');
    done.forEach(r => onTagsSaved(r.path, r.tags));
    toast(`${done.length} archivos etiquetados con IA`, 'success');
    onClose();
  };

  const removeTag = (rIdx: number, tag: string) => {
    setResults(prev => prev.map((r, i) => i === rIdx ? { ...r, tags: r.tags.filter(t => t !== tag) } : r));
  };

  const addTag = (rIdx: number) => {
    if (!newTag.trim()) return;
    setResults(prev => prev.map((r, i) => i === rIdx ? { ...r, tags: [...r.tags, newTag.trim()] } : r));
    setNewTag('');
    setEditingIdx(null);
  };

  const done = results.filter(r => r.status === 'done').length;
  const total = results.length;

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="modal"
        style={{ width: 640, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Sparkles size={20} className="accent-text" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Auto-Etiquetado con IA</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Llama 3.2-Vision 11B • Local • Sin internet</div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Ollama Status */}
        {ollamaStatus && !ollamaStatus.available && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#f87171', display: 'flex', gap: 8, alignItems: 'center' }}>
            <WifiOff size={14} />
            Ollama no está corriendo. Abrí la app Ollama en tu PC o ejecutá <code style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 4px', borderRadius: 3 }}>ollama serve</code> en terminal.
          </div>
        )}
        {ollamaStatus?.available && !ollamaStatus.modelAvailable && (
          <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#fbbf24', display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={14} />
            Modelo no descargado. Ejecutá: <code style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 4px', borderRadius: 3 }}>ollama pull llama3.2-vision:11b</code>
          </div>
        )}

        {/* Progress bar */}
        {(running || done > 0) && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>{running ? `Procesando ${current + 1} de ${total}...` : `${done} de ${total} completados`}</span>
              <span>{Math.round((done / total) * 100)}%</span>
            </div>
            <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
              <motion.div
                animate={{ width: `${(done / total) * 100}%` }}
                style={{ height: '100%', background: 'var(--accent)', borderRadius: 2 }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {/* File list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
          {results.map((r, rIdx) => (
            <div key={r.path} style={{ background: 'var(--bg-surface)', borderRadius: 8, border: `1px solid ${r.status === 'error' ? 'rgba(239,68,68,0.3)' : r.status === 'done' ? 'rgba(34,197,94,0.2)' : 'var(--border-subtle)'}`, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: r.status === 'done' ? 8 : 0 }}>
                {r.status === 'processing' && <Loader size={14} className="accent-text" style={{ animation: 'spin 1s linear infinite' }} />}
                {r.status === 'done' && <CheckCircle size={14} style={{ color: '#22c55e' }} />}
                {r.status === 'error' && <AlertCircle size={14} style={{ color: '#ef4444' }} />}
                {r.status === 'pending' && <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--border-subtle)' }} />}
                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.path}>{r.name}</span>
                {r.status === 'error' && <span style={{ fontSize: 10, color: '#f87171' }}>{r.error}</span>}
              </div>

              {r.status === 'done' && (
                <>
                  {r.description && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontStyle: 'italic' }}>
                      {r.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    {r.tags.map(tag => (
                      <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: 12, padding: '2px 8px', fontSize: 11 }}>
                        #{tag}
                        <button onClick={() => removeTag(rIdx, tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', opacity: 0.6, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                    {editingIdx === rIdx ? (
                      <input
                        autoFocus
                        value={newTag}
                        onChange={e => setNewTag(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addTag(rIdx); if (e.key === 'Escape') setEditingIdx(null); }}
                        onBlur={() => { addTag(rIdx); }}
                        placeholder="nueva etiqueta..."
                        style={{ fontSize: 11, padding: '2px 6px', borderRadius: 12, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--text-primary)', outline: 'none', width: 110 }}
                      />
                    ) : (
                      <button onClick={() => { setEditingIdx(rIdx); setNewTag(''); }} style={{ background: 'var(--bg-elevated)', border: '1px dashed var(--border-subtle)', borderRadius: 12, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--text-muted)' }}>
                        + agregar
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', alignItems: 'center' }}>
          {!running && done === 0 && total > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 'auto' }}>
              ~{total <= 5 ? `${total * 3}s` : total <= 20 ? `${Math.round(total * 2.5 / 60)}–${Math.round(total * 4 / 60)} min` : `${Math.round(total * 2 / 60)}–${Math.round(total * 4 / 60)} min`} estimados
            </span>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          {!running && done === 0 && (
            <button
              className="btn btn-primary"
              onClick={runTagging}
              disabled={ollamaStatus?.available === false || !ollamaStatus?.modelAvailable}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Sparkles size={14} /> Analizar {total} {total === 1 ? 'archivo' : 'archivos'}
            </button>
          )}
          {!running && done > 0 && (
            <button className="btn btn-primary" onClick={saveAll} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={14} /> Guardar {done} etiquetas
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
