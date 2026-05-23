'use client';

import { useState, useEffect, useCallback, useRef, useDeferredValue, useMemo } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import {
  Folder, File, Image as ImageIcon, Film, Music, FileText, Archive, Code, HardDrive,
  Search, Grid, List, ChevronRight, HomeIcon, ArrowLeft, ArrowUp, ArrowDown, Plus,
  Trash2, Trash, Edit2, RefreshCw, BarChart2, Wand2, X, CheckCircle, AlertCircle, 
  Terminal, Monitor, Type, AlertTriangle, ArrowRight, Play, ZoomIn, ChevronLeft,
  Pause, Volume2, VolumeX, SkipBack, SkipForward, Maximize, FolderOpen, FileArchive,
  FolderPlus, MoveRight, Copy, CheckSquare, Square, ExternalLink, Info, Check, Tag, Palette,
  Sparkles, Loader, Cpu, Wifi, WifiOff, ChevronDown, CheckCircle2, FileText as FileTextIcon, History, Key, Lock, SearchCode, Package,
  MoreVertical, ChevronsUp, ArrowUpDown, SortAsc, SortDesc, Undo, Clapperboard, Globe, FolderSearch
} from 'lucide-react';
import { FileEntry, DirectoryListing, DiskStats, OrganizePreview } from '@/lib/types';
import { getFileTypeInfo, formatSize, formatDate } from '@/lib/file-types';
import { 
  InlineRenameInput, FileCheckbox, VideoThumb, ImageCover, DocCover, FileThumbnail, FileListIcon,
  VideoPlayer, PreviewModal, ContextMenu, RenameModal, DeleteModal, MkdirModal, BulkActionModal,
  BulkMoveModal, BulkDeleteModal, OrganizeModal, StatsPanel, useToast, MoveToModal, TrashModal, AnimatedTrashIcon, MetadataModal, DuplicateView,
  AITagModal, AIStatusBar
} from './components';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'heic', 'tiff', 'tif']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'm4v']);
const DOC_EXTS = new Set(['pdf', 'psd']);
const PREVIEWABLE = new Set([...IMAGE_EXTS, ...VIDEO_EXTS, ...DOC_EXTS]);

// ─── Pack Success Animation ───────────────────────────────────────────────────
const FLY_ICONS = [Film, Archive, Music, FileText, Code, ImageIcon] as const;

// Timing constants — single source of truth for ALL animations
const ICON_DUR       = 1.2;   // how long an icon travels
const ICON_STEP      = 0.22;  // stagger between icons
const REPEAT_DELAY   = 2.2;   // pause before repeating
const CYCLE          = ICON_DUR + REPEAT_DELAY; // 3.4 s — the shared loop period
const N              = FLY_ICONS.length;        // 6

// Build keyframe arrays for the circle & box that pulse exactly when each icon arrives.
// ARRIVAL_FRAC: the icon visually "hits" the box at ~67% of its travel time
// (it's fading out after that), so fire the pulse there, not at ICON_DUR end.
const ARRIVAL_FRAC = 0.67; // tune: 0=start of travel, 1=mathematical end

function buildPulseKFs() {
  const PW = 0.022; // half-width in normalised time (~75ms at 3.4s)
  const times: number[]   = [0];
  const scaleKF: number[] = [1];
  const bgKF: string[]    = ['rgba(14,201,0,0.15)'];
  const bdKF: string[]    = ['rgba(14,201,0,0.40)'];

  for (let i = 0; i < N; i++) {
    // Fire at the moment the icon visually reaches the box center
    const t = (i * ICON_STEP + ICON_DUR * ARRIVAL_FRAC) / CYCLE;
    times.push(  Math.max(0, t - PW),  t,           t + PW,              Math.min(1, t + PW * 3));
    scaleKF.push(1,                    1.24,         0.90,                1);
    bgKF.push(   'rgba(14,201,0,0.15)','rgba(14,201,0,0.45)','rgba(14,201,0,0.20)','rgba(14,201,0,0.15)');
    bdKF.push(   'rgba(14,201,0,0.40)','rgba(14,201,0,0.95)','rgba(14,201,0,0.55)','rgba(14,201,0,0.40)');
  }

  // End of cycle — back to rest
  if (times[times.length - 1] < 1) {
    times.push(1); scaleKF.push(1);
    bgKF.push('rgba(14,201,0,0.15)'); bdKF.push('rgba(14,201,0,0.40)');
  }

  return { times, scaleKF, bgKF, bdKF };
}

const { times: pulseTimes, scaleKF, bgKF, bdKF } = buildPulseKFs();

// Shared transition for the loop — same duration as CYCLE, linear so
// the `times` array controls the easing precisely at each keyframe.
const loopTransition = {
  duration: CYCLE,
  repeat: Infinity,
  ease: 'linear' as const,
  times: pulseTimes,
};

function PackAnimation() {
  return (
    <div style={{ position: 'relative', height: 180, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

      {/* ── Circle — flashes on each icon arrival ── */}
      <motion.div
        animate={{ background: bgKF, borderColor: bdKF }}
        transition={loopTransition}
        style={{
          width: 90, height: 90, borderRadius: '50%',
          border: '2px solid rgba(14,201,0,0.40)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--accent)', position: 'relative', zIndex: 2,
        }}
      >
        {/* ── Package box — pops on each icon arrival ── */}
        <motion.div
          animate={{ scale: scaleKF }}
          transition={loopTransition}
        >
          <Package size={44} strokeWidth={1.5} />
        </motion.div>
      </motion.div>

      {/* ── Flying icons — bezier curves from all directions ── */}
      {FLY_ICONS.map((Icon, i) => {
        const rad    = (i / N) * Math.PI * 2;
        const startX = Math.cos(rad) * 140;
        const startY = Math.sin(rad) * 110;
        // Perpendicular offset → quadratic-bezier feel
        const perpRad = rad + Math.PI / 2;
        const midX  = startX * 0.5 + Math.cos(perpRad) * 52;
        const midY  = startY * 0.5 + Math.sin(perpRad) * 52;
        return (
          <motion.div
            key={i}
            style={{ position: 'absolute', color: 'var(--accent)', display: 'flex', zIndex: 1 }}
            animate={{
              x:       [startX, midX, 0],
              y:       [startY, midY, 0],
              opacity: [0,      1,    0],
              scale:   [1.4,    1.05, 0.1],
            }}
            transition={{
              delay:       i * ICON_STEP,   // first-play stagger only
              duration:    ICON_DUR,
              repeat:      Infinity,
              repeatDelay: REPEAT_DELAY,
              ease:        [0.22, 0.44, 0.45, 0.95],
              times:       [0, 0.48, 1],
            }}
          >
            <Icon size={26} strokeWidth={1.5} />
          </motion.div>
        );
      })}
    </div>
  );
}


// ─── Sidebar Tree Components (adapted from Magic UI FileTree) ─────────────────

interface TreeNodeProps {
  path: string;
  label: string;
  Icon?: React.ElementType;
  isActive: boolean;
  onNavigate: (path: string) => void;
  depth?: number;
  isRoot?: boolean;
}

// A single node in the sidebar tree — arrow expands, label navigates (Magic UI style)
function TreeNode({ path, label, Icon, isActive, onNavigate, depth = 0, isRoot = false }: TreeNodeProps) {
  const [open, setOpen] = useState(false);
  const [childFolders, setChildFolders] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const toggle = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!open && !fetched) {
      setLoading(true);
      try {
        const res = await fetch(`/api/fs?path=${encodeURIComponent(path)}`);
        const data = await res.json();
        const dirs = (data.entries ?? [])
          .filter((e: { isDir: boolean }) => e.isDir)
          .map((e: { name: string; path: string }) => ({ name: e.name, path: e.path }));
        setChildFolders(dirs);
        setFetched(true);
      } catch { /* ignore */ }
      setLoading(false);
    }
    setOpen(o => !o);
  };

  // Magic UI style: FolderOpen when expanded
  const FolderIcon = open ? FolderOpen : (Icon ?? Folder);

  return (
    <div style={{ position: 'relative' }}>
      {/* Row */}
      <motion.div
        onClick={(e) => {
          onNavigate(path);
          if (!open) toggle(e);
        }}
        whileHover={{ backgroundColor: isActive ? undefined : 'rgba(255,255,255,0.04)' }}
        whileTap={{ scale: 0.985 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          paddingLeft: 8 + depth * 16,
          paddingRight: 8,
          paddingTop: 3,
          paddingBottom: 3,
          borderRadius: 5,
          cursor: 'pointer',
          backgroundColor: isActive ? 'rgba(74,222,128,0.1)' : 'transparent',
          position: 'relative',
          userSelect: 'none',
        }}
      >
        {/* Expand arrow */}
        <motion.div
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 14, height: 14, flexShrink: 0,
            color: 'var(--text-muted)', opacity: 0.55, borderRadius: 3,
          }}
          onClick={(e) => { e.stopPropagation(); toggle(e); }}
        >
          {loading
            ? <Loader size={9} className="spinning" />
            : <ChevronRight size={10} strokeWidth={2.5} />
          }
        </motion.div>

        {/* Folder icon */}
        <motion.span
          animate={{
            color: isActive ? 'var(--accent)' : open ? 'var(--accent)' : 'var(--text-secondary)',
            scale: isActive ? 1.08 : 1,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          style={{ display: 'flex', flexShrink: 0 }}
        >
          <FolderIcon size={13} strokeWidth={1.6} />
        </motion.span>

        {/* Label */}
        <span style={{
          fontSize: 12.5,
          color: isActive ? 'var(--accent)' : 'var(--text-primary)',
          fontWeight: isActive ? 600 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          letterSpacing: '-0.01em',
        }}>
          {label}
        </span>
      </motion.div>

      {/* Children */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden', position: 'relative' }}
          >
            {/* Magic UI indent guide line */}
            <div style={{
              position: 'absolute',
              left: 8 + depth * 16 + 15,
              top: 0,
              bottom: 6,
              width: 1,
              background: 'var(--border-subtle)',
              opacity: 0.6,
            }} />

            {childFolders.length === 0 && fetched ? (
              <div style={{
                paddingLeft: 8 + (depth + 1) * 16 + 14,
                paddingTop: 3, paddingBottom: 3,
                fontSize: 11.5, color: 'var(--text-muted)', opacity: 0.45,
                letterSpacing: '-0.01em',
              }}>
                Vacío
              </div>
            ) : (
              childFolders.map((child, i) => (
                <motion.div
                  key={child.path}
                  initial={{ opacity: 0, x: -3 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.025, duration: 0.13 }}
                >
                  <TreeNode
                    path={child.path}
                    label={child.name}
                    isActive={false}
                    onNavigate={onNavigate}
                    depth={depth + 1}
                  />
                </motion.div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function SidebarSection({ title, children, defaultOpen = true }: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ marginBottom: 4 }}>
      <motion.div
        className="sidebar-section-title"
        onClick={() => setOpen(o => !o)}
        style={{
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', userSelect: 'none', paddingRight: 8,
        }}
        whileTap={{ scale: 0.98 }}
      >
        <span>{title}</span>
        <motion.span
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          style={{ display: 'flex', color: 'var(--text-muted)', opacity: 0.5 }}
        >
          <ChevronDown size={11} strokeWidth={2.5} />
        </motion.span>
      </motion.div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="sidebar-tree">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function FileOrgApp() {

  const [currentPath, setCurrentPath] = useState<string>('C:\\');

  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  
  // Drives and Quick Access
  const [drives, setDrives] = useState<string[]>(['C:\\']);
  const [quickAccess, setQuickAccess] = useState<{name: string, path: string}[]>([]);
  
  // Inline rename state
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Preview state
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const closePreview = () => setPreviewEntry(null);

  // Video Hover state
  const [hoveredVideo, setHoveredVideo] = useState<string | null>(null);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, entry: FileEntry } | null>(null);
  const [showMoveTo, setShowMoveTo] = useState<string[] | null>(null); // paths to move
  const [showMetadataEntry, setShowMetadataEntry] = useState<FileEntry | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [aiTagEntries, setAITagEntries] = useState<FileEntry[] | null>(null);
  const [aeLinks, setAeLinks] = useState<Record<string, string[]>>({});
  const [isScanningAE, setIsScanningAE] = useState(false);
  const closeContextMenu = () => setContextMenu(null);
  
  // Toasts
  const [toasts, setToasts] = useState<{ id: string, message: string, type: 'success' | 'error' | 'info' }[]>([]);
  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  // Undo System
  type UndoAction = {
    type: 'delete' | 'move' | 'rename' | 'mkdir';
    items: { originalPath: string, newPath: string, trashPath?: string }[];
  };
  const [undoHistory, setUndoHistory] = useState<UndoAction[]>([]);
  const [returningItems, setReturningItems] = useState<string[]>([]);
  const [trashCount, setTrashCount] = useState(0);

  const [trashItems, setTrashItems] = useState<any[] | null>(null);
  const [isFetchingTrash, setIsFetchingTrash] = useState(false);
  const [pathInput, setPathInput] = useState('');
  const [searchResults, setSearchResults] = useState<FileEntry[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(100);
  const [sortBy, setSortBy] = useState('name');
  const [sortDesc, setSortDesc] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searching = isSearching;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'global' | 'local'>('local'); // Default to local
  type PackFileStatus = { name: string; status: 'pending' | 'copying' | 'done' | 'error' };
  const [packState, setPackState] = useState<{ path: string; copied: number; total: number; message?: string; files: PackFileStatus[] } | null>(null);
  const [packDone, setPackDone] = useState<{ totalFiles: number; totalBytes: number; destPath: string; files: PackFileStatus[] } | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const fileContentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const totalEntries = searchResults?.length ?? (listing?.entries.length ?? 0);

  const goUp = () => {
    if (currentPath.length > 3) {
      const parent = currentPath.substring(0, currentPath.lastIndexOf('\\')) || currentPath.substring(0, 3);
      setCurrentPath(parent);
    }
  };

  // Toggle sort column: same field → flip direction, new field → asc
  const handleSort = useCallback((field: string) => {
    if (sortBy === field) {
      setSortDesc(prev => !prev);
    } else {
      setSortBy(field);
      setSortDesc(false);
    }
  }, [sortBy]);

  const handlePackProject = async (aepPath: string) => {
    setPackState({ path: aepPath, copied: 0, total: 0, message: 'Iniciando...', files: [] });
    try {
      // 1. Start the job
      const startRes = await fetch('/api/ae-collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aepPath })
      });
      const { jobId, error: startError } = await startRes.json();
      if (startError) throw new Error(startError);

      // 2. Poll every 300ms
      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const pollRes = await fetch(`/api/ae-collect?jobId=${jobId}`);
            const data = await pollRes.json();

            if (data.error) {
              clearInterval(interval);
              reject(new Error(data.error));
              return;
            }

            setPackState({
              path: aepPath,
              message: data.message,
              copied: data.copied,
              total: data.total,
              files: data.files || [],
            });

            if (data.state === 'done') {
              clearInterval(interval);
              const finalFiles = data.files || [];
              setPackState(null);
              refresh();
              setPackDone({ totalFiles: data.copied, totalBytes: data.totalBytes ?? 0, destPath: data.destPath, files: finalFiles });
              resolve();
            } else if (data.state === 'error') {
              clearInterval(interval);
              reject(new Error(data.error));
            }
          } catch (e: any) {
            clearInterval(interval);
            reject(e);
          }
        }, 300);
      });
    } catch (err: any) {
      alert('Fallo al empaquetar: ' + err.message);
      setPackState(null);
    }
  };

  // Scroll listener for scroll-to-top button
  useEffect(() => {
    const el = fileContentRef.current;
    if (!el) return;
    const onScroll = () => setShowScrollTop(el.scrollTop > 300);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Infinite scroll: load more when sentinel becomes visible
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount(prev => prev + 100); },
      { root: fileContentRef.current, rootMargin: '200px' }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [totalEntries]);

  // Reset visible count when navigating to a new folder
  useEffect(() => { setVisibleCount(100); }, [currentPath]);

  const handleClick = (e: React.MouseEvent, entry: FileEntry) => {
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(entry.path, e);
      return;
    }
    if (entry.isDir) {
      setCurrentPath(entry.path);
    } else {
      if (PREVIEWABLE.has(entry.ext)) {
        setPreviewEntry(entry);
      } else {
        handleOpen(entry.path);
      }
    }
  };

  const onContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry });
  };

  const handleInlineRename = async (filePath: string, newName: string) => {
    const entry = inlineRenameEntry;
    setInlineRenameEntry(null);
    if (!entry || !newName.trim()) return;
    // Build the final filename: if user typed without extension, keep original ext
    const hasExt = newName.includes('.');
    const finalName = hasExt ? newName : `${newName}${entry.ext ? '.' + entry.ext : ''}`;
    if (finalName === entry.name) return;
    try {
      await doAction('rename', { path: filePath, newName: finalName });
    } catch {}
  };

  const handleMkdir = async (name: string) => {
    try {
      await doAction('mkdir', { path: currentPath, newName: name });
    } catch {}
  };


  const [previewEntry, setPreviewEntry] = useState<FileEntry | null>(null);
  const [customPreviewList, setCustomPreviewList] = useState<FileEntry[] | null>(null);
  
  const [showMkdir, setShowMkdir] = useState(false);
  const [renameEntry, setRenameEntry] = useState<FileEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<FileEntry | null>(null);
  const [showOrganize, setShowOrganize] = useState(false);
  const [showStats, setShowStats] = useState(false);
  
  const [inlineRenameEntry, setInlineRenameEntry] = useState<FileEntry | null>(null);
  const [bulkAction, setBulkAction] = useState<'group' | 'zip' | 'rename' | 'move' | 'copy' | 'delete' | null>(null);

  const handleMoveTo = async (destPath: string) => {
    if (!showMoveTo || !destPath) return;
    const paths = showMoveTo;
    setShowMoveTo(null);
    clearSelection();
    
    try {
      const res = await fetch('/api/fs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move', paths, destPath })
      });
      if (!res.ok) throw new Error('Bulk move failed');
      const data = await res.json();
      
      if (data.undoAction) setUndoHistory(prev => [...prev, data.undoAction]);
      toast(paths.length === 1 ? 'Archivo movido' : `${paths.length} archivos movidos`, 'success');
      refresh();
    } catch {
      toast('Error al mover archivos', 'error');
    }
  };

  const fetchTrashCount = useCallback(async () => {
    try {
      const res = await fetch('/api/fs/trash/count');
      const data = await res.json();
      if (!data.error) setTrashCount(data.count);
    } catch {}
  }, []);

  const fetchAeLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/ae-links');
      const data = await res.json();
      if (!data.error) setAeLinks(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAeLinks();
  }, [fetchAeLinks]);

  useEffect(() => {
    fetch('/api/fs/drives')
      .then(r => r.json())
      .then(d => { 
        if (d.drives) setDrives(d.drives); 
        if (d.quickAccess) setQuickAccess(d.quickAccess);
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    if (!currentPath) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/fs?path=${encodeURIComponent(currentPath)}`);
      if (res.ok) {
        const data = await res.json();
        setListing(data);
        setSearchResults(null);
      }
    } catch {}
    setIsLoading(false);
    fetchTrashCount();
  }, [currentPath, fetchTrashCount]);

  const handleMetadataSave = useCallback(async (entry: FileEntry, color: string | null, tags: string[]) => {
    try {
      const res = await fetch('/api/fs/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path, color, tags })
      });
      if (!res.ok) throw new Error('Failed to save metadata');
      refresh();
    } catch {
      toast('Error al guardar etiquetas', 'error');
    }
  }, [toast, refresh]);

  const handleTagsSaved = useCallback(async (filePath: string, tags: string[]) => {
    try {
      // Load existing metadata then merge tags
      const res = await fetch(`/api/fs/metadata?path=${encodeURIComponent(filePath)}`);
      const existing = res.ok ? await res.json() : { color: null, tags: [] };
      const merged = Array.from(new Set([...(existing.tags || []), ...tags]));
      await fetch('/api/fs/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, color: existing.color || null, tags: merged })
      });
    } catch {
      toast('Error al guardar etiquetas IA', 'error');
    }
  }, [toast]);

  // Called when AITagModal closes — refresh to show new tags on file cards
  const handleAITagClose = useCallback(() => {
    setAITagEntries(null);
    refresh(); // reload directory so tags appear on file cards
  }, [refresh]);

  // Sync path input with currentPath
  useEffect(() => {
    setPathInput(currentPath);
  }, [currentPath]);

  // Real search implementation
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const rootPath = searchScope === 'global' ? 'C:\\' : currentPath;
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&path=${encodeURIComponent(rootPath)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.entries || []);
        }
      } catch {}
      setIsSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, currentPath, searchScope]);


  // Handle Ctrl+Z Undo
  useEffect(() => {
    refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const handleUndo = useCallback(async () => {
    if (undoHistory.length === 0) return;
    const lastAction = undoHistory[undoHistory.length - 1];
    setUndoHistory(prev => prev.slice(0, -1));
    
    const returningPaths = lastAction.items.map(item => item.originalPath);
    setReturningItems(prev => [...prev, ...returningPaths]);
    
    try {
      await fetch('/api/fs/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'undo', undoAction: lastAction })
      });
      toast('Acción deshecha exitosamente', 'success');
      refresh();
    } catch {
      toast('Error al deshacer', 'error');
    }
    
    setTimeout(() => {
      setReturningItems(prev => prev.filter(p => !returningPaths.includes(p)));
    }, 2000);
  }, [undoHistory, refresh, toast]);

  const doAction = useCallback(async (action: string, payload: any) => {
    if (action === 'open') {
      await fetch('/api/fs/action', { method: 'POST', body: JSON.stringify({ action: 'open', path: payload.path }) });
      return;
    }
    if (action === 'scan-ae') {
      try {
        setIsScanningAE(true);
        toast('Escaneando proyectos After Effects...', 'info');
        const res = await fetch('/api/ae-scanner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dirPath: currentPath })
        });
        const data = await res.json();
        if (data.success) {
          toast(`Escaneo AE completado: ${data.aepFilesFound} proyectos encontrados, ${data.linksFound} dependencias.`, 'success');
          fetchAeLinks();
        } else {
          toast(data.error || 'Error escaneando', 'error');
        }
      } catch (e: any) {
        toast(e.message, 'error');
      } finally {
        setIsScanningAE(false);
      }
      return;
    }
    const res = await fetch('/api/fs/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    if (!res.ok) throw new Error('Action failed');
    const data = await res.json();
    if (data.undoAction) setUndoHistory(prev => [...prev, data.undoAction]);
    refresh();
    return data;
  }, [refresh]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    if (editingPath) {
      setEditingPath(null);
      setEditValue('');
    }
  }, [editingPath]);

  const handleDelete = useCallback(async (paths: string[]) => {
    try {
      const res = await fetch('/api/fs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', paths })
      });
      if (!res.ok) throw new Error('Bulk delete failed');
      const data = await res.json();
      
      if (data.undoAction) setUndoHistory(prev => [...prev, data.undoAction]);
      
      toast(paths.length === 1 ? 'Archivo enviado a la papelera' : `${paths.length} archivos enviados a la papelera`, 'success');
      clearSelection();
      refresh();
    } catch {
      toast('Error al eliminar', 'error');
    }
  }, [toast, clearSelection, refresh]);

  const handleZip = useCallback(async (paths: string[]) => {
    const newName = window.prompt("Nombre del archivo ZIP:", "Archivo.zip");
    if (!newName) return;
    try {
      const res = await fetch('/api/fs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'zip', paths, destPath: currentPath, newName })
      });
      if (!res.ok) throw new Error('Bulk zip failed');
      toast('Archivos comprimidos exitosamente', 'success');
      clearSelection();
      refresh();
    } catch {
      toast('Error al comprimir archivos', 'error');
    }
  }, [currentPath, toast, clearSelection, refresh]);

  const handleUnzip = useCallback(async (path: string) => {
    try {
      toast('Extrayendo archivo...', 'success');
      const res = await fetch('/api/fs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unzip', paths: [path], destPath: currentPath })
      });
      if (!res.ok) throw new Error('Unzip failed');
      toast('Archivo extraído exitosamente', 'success');
      refresh();
    } catch {
      toast('Error al extraer archivo', 'error');
    }
  }, [currentPath, toast, refresh]);

  const deferredListing = useDeferredValue(listing);

  // Sort entries
  const displayedEntries = useMemo(() => {
    const base = searchResults || deferredListing?.entries || [];
    return [...base].sort((a, b) => {
      // Dirs always first regardless of sort
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      let cmp = 0;
      switch (sortBy) {
        case 'name':     cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }); break;
        case 'type':     cmp = (a.ext || '').localeCompare(b.ext || '', undefined, { sensitivity: 'base' }); break;
        case 'size':     cmp = a.size - b.size; break;
        case 'created':  cmp = new Date(a.created).getTime() - new Date(b.created).getTime(); break;
        case 'modified': cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime(); break;
        default:         cmp = a.name.localeCompare(b.name); break;
      }
      return sortDesc ? -cmp : cmp;
    });
  }, [searchResults, deferredListing, sortBy, sortDesc]);

  const visualEntries = useMemo(() => {
    if (viewMode === 'list') return displayedEntries;
    const dirs = displayedEntries.filter(e => e.isDir);
    const coverFiles = displayedEntries.filter(e => !e.isDir && PREVIEWABLE.has(e.ext));
    const otherFiles = displayedEntries.filter(e => !e.isDir && !PREVIEWABLE.has(e.ext));
    return [...dirs, ...coverFiles, ...otherFiles];
  }, [displayedEntries, viewMode]);

  // Keyboard Navigation & Undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Undo (Ctrl+Z)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Navigate Up (Backspace)
      if (e.key === 'Backspace') {
        e.preventDefault();
        goUp();
        return;
      }
      
      // Select All (Ctrl+A)
      const entries = visualEntries;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelected(new Set(entries.map(x => x.path)));
        return;
      }

      if (!entries.length) return;
      const currentIndex = focusedPath ? entries.findIndex(x => x.path === focusedPath) : -1;

      // Navigation
      if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        let nextIndex = currentIndex;
        
        if (currentIndex === -1) {
          nextIndex = 0; // Focus first item
        } else {
          if (viewMode === 'list') {
            if (e.key === 'ArrowDown') nextIndex = Math.min(entries.length - 1, currentIndex + 1);
            if (e.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - 1);
          } else {
            // Find exact column count dynamically by measuring elements in the first row
            let columns = 1;
            const cards = document.querySelectorAll('.file-card');
            if (cards.length > 1) {
              const firstY = cards[0].getBoundingClientRect().y;
              for (let i = 1; i < cards.length; i++) {
                if (Math.abs(cards[i].getBoundingClientRect().y - firstY) < 10) columns++;
                else break;
              }
            } else {
              columns = window.innerWidth > 1200 ? 6 : window.innerWidth > 800 ? 4 : 2;
            }
            if (e.key === 'ArrowRight') nextIndex = Math.min(entries.length - 1, currentIndex + 1);
            if (e.key === 'ArrowLeft') nextIndex = Math.max(0, currentIndex - 1);
            if (e.key === 'ArrowDown') nextIndex = Math.min(entries.length - 1, currentIndex + columns);
            if (e.key === 'ArrowUp') nextIndex = Math.max(0, currentIndex - columns);
          }
        }
        
        const targetEntry = entries[nextIndex];
        if (targetEntry) {
          if (nextIndex >= visibleCount) {
            setVisibleCount(prev => Math.max(prev, nextIndex + 50));
          }
          setFocusedPath(targetEntry.path);
          // If moving with arrows and no modifier is held, automatically select the focused item (native OS behavior)
          if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
            setSelected(new Set([targetEntry.path]));
          }
          // Scroll into view
          setTimeout(() => {
            const el = document.querySelector(`[data-path="${targetEntry.path.replace(/\\/g, '\\\\')}"]`);
            if (el) {
              // use auto to prevent jank when navigating fast
              el.scrollIntoView({ behavior: 'auto', block: 'nearest' });
            }
          }, 50); // increased timeout slightly to allow React to render newly visible items
        }
      }
      
      // Space for Quick Look or Ctrl+Space to toggle selection
      if (e.key === ' ') {
        e.preventDefault();
        if (focusedPath) {
          if (e.ctrlKey || e.metaKey) {
            const newSel = new Set(selected);
            if (newSel.has(focusedPath)) newSel.delete(focusedPath);
            else newSel.add(focusedPath);
            setSelected(newSel);
          } else {
            const entry = entries.find(x => x.path === focusedPath);
            if (entry && !entry.isDir && PREVIEWABLE.has(entry.ext)) setPreviewEntry(entry);
          }
        }
      }
      
      // Enter to open
      if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedPath) {
          const entry = entries.find(x => x.path === focusedPath);
          if (entry) {
            if (entry.isDir) setCurrentPath(entry.path);
            else handleOpen(entry.path);
          }
        }
      }
      
      // Delete
      if (e.key === 'Delete') {
        e.preventDefault();
        const toDelete = selected.size > 0 ? Array.from(selected) : (focusedPath ? [focusedPath] : []);
        if (toDelete.length > 0) handleDelete(toDelete);
      }
      
      // F2 to Rename
      if (e.key === 'F2') {
        e.preventDefault();
        if (focusedPath) {
          const entry = entries.find(x => x.path === focusedPath);
          if (entry) setInlineRenameEntry(entry);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, focusedPath, selected, visualEntries, viewMode, handleDelete, currentPath, visibleCount]);

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, entry: FileEntry) => {
    const paths = selected.has(entry.path) ? Array.from(selected) : [entry.path];
    e.dataTransfer.setData('application/json', JSON.stringify({ paths }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, entry: FileEntry) => {
    if (entry.isDir) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDrop = async (e: React.DragEvent, targetEntry: FileEntry) => {
    e.preventDefault();
    if (!targetEntry.isDir) return;
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.paths && data.paths.length > 0) {
        const pathsToMove = data.paths.filter((p: string) => p !== targetEntry.path);
        if (pathsToMove.length === 0) return;
        
        const res = await fetch('/api/fs/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'move', paths: pathsToMove, dest: targetEntry.path })
        });
        if (res.ok) {
          const d = await res.json();
          if (d.undoAction) setUndoHistory(prev => [...prev, d.undoAction]);
          refresh();
          toast(`Movidos ${pathsToMove.length} items a ${targetEntry.name}`, 'success');
          clearSelection();
        }
      }
    } catch {}
  };

  const handleTrashDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.paths && data.paths.length > 0) {
        handleDelete(data.paths);
      }
    } catch {}
  };

  const toggleSelect = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSel = new Set(selected);
    if (newSel.has(path)) newSel.delete(path);
    else newSel.add(path);
    setSelected(newSel);
  };

  const startRename = (path: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPath(path);
    setEditValue(name);
  };

  const commitRename = async () => {
    if (!editingPath || !editValue.trim()) {
      setEditingPath(null);
      return;
    }
    const currentName = editingPath.split('\\').pop();
    if (currentName === editValue) {
      setEditingPath(null);
      return;
    }
    try {
      await doAction('rename', { path: editingPath, newName: editValue });
      toast('Archivo renombrado', 'success');
    } catch {}
    setEditingPath(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') setEditingPath(null);
  };

  const handleOpen = async (path: string) => {
    try {
      await doAction('open', { path });
    } catch {}
  };

  // Modals state
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [showOrgModal, setShowOrgModal] = useState(false);



  const renderGridCard = (entry: FileEntry, forceCover: boolean = false) => {
    const isSelected = selected.has(entry.path);
    const isReturning = returningItems.includes(entry.path);
    const isEditing = inlineRenameEntry?.path === entry.path;
    const isDoc = DOC_EXTS.has(entry.ext);
    const isImage = IMAGE_EXTS.has(entry.ext);
    const isVideo = VIDEO_EXTS.has(entry.ext);
    const useCoverLayout = forceCover || (!entry.isDir && (isImage || isVideo || isDoc));
    const linkedProjects = aeLinks[entry.path] || [];
    return (
      <motion.div
        layout
        key={entry.path}
        data-path={entry.path}
        className={`file-card ${isSelected ? 'selected' : ''} ${focusedPath === entry.path ? 'focused' : ''} ${useCoverLayout ? 'video-card' : ''}`}
        draggable={true}
        onDragStart={(e: any) => handleDragStart(e, entry)}
        onDragOver={(e: any) => handleDragOver(e, entry)}
        onDrop={(e: any) => handleDrop(e, entry)}
        onClick={e => { e.stopPropagation(); setFocusedPath(entry.path); handleClick(e, entry); }}
        onContextMenu={e => onContextMenu(e, entry)}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1, boxShadow: isReturning ? '0 0 15px rgba(0,255,100,0.6)' : 'none', borderColor: isReturning ? 'rgba(0,255,100,0.8)' : 'transparent' }}
        transition={{ duration: 0.15 }}
      >
        <FileCheckbox selected={isSelected} onToggle={() => toggleSelect(entry.path, { stopPropagation: () => {} } as any)} />
        {entry.color && (
          <div className="file-color-dot" style={{ background: entry.color, position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: '50%', zIndex: 10, boxShadow: '0 0 0 1.5px #050805' }} />
        )}
        {linkedProjects.length > 0 && (
          <div style={{ position: 'absolute', top: 8, right: entry.color ? 24 : 8, zIndex: 10, background: '#3b0764', color: '#c4b5fd', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4, boxShadow: '0 2px 5px rgba(0,0,0,0.4)' }} title="Usado en proyectos de After Effects">
             <Clapperboard size={10} color="#c4b5fd" /> {linkedProjects.length}
          </div>
        )}
        {useCoverLayout ? (
          <>
            <div className="file-thumb-cover">
              {isVideo && <VideoThumb src={`/api/preview?path=${encodeURIComponent(entry.path)}`} cover />}
              {isImage && <ImageCover src={`/api/image-thumb?path=${encodeURIComponent(entry.path)}`} name={entry.name} ext={entry.ext} />}
              {isDoc && <DocCover src={entry.path} name={entry.name} ext={entry.ext} />}
              {!isVideo && !isImage && !isDoc && (
                 <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', borderRadius: '12px 12px 0 0' }}>
                   <FileThumbnail entry={entry} size={72} />
                 </div>
              )}
            </div>
            <div className="video-card-info">
              {isEditing ? (
                <InlineRenameInput entry={entry} onConfirm={handleInlineRename} onCancel={() => setInlineRenameEntry(null)} />
              ) : (
                <div className="video-card-name" title={entry.name} onClick={e => { e.stopPropagation(); setInlineRenameEntry(entry); }}>{entry.name}</div>
              )}
              <div className="video-card-meta">
                {formatSize(entry.size)}
                {entry.tags && entry.tags.length > 0 && (
                  <span style={{ color: 'var(--accent)', marginLeft: 6 }}>• {entry.tags[0]} {entry.tags.length > 1 ? `+${entry.tags.length - 1}` : ''}</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <FileThumbnail entry={entry} size={56} />
            {isEditing ? (
              <InlineRenameInput entry={entry} onConfirm={handleInlineRename} onCancel={() => setInlineRenameEntry(null)} />
            ) : (
              <div className="file-card-name" title={entry.name} onClick={e => { e.stopPropagation(); setInlineRenameEntry(entry); }}>{entry.name}</div>
            )}
            {entry.tags && entry.tags.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--accent)', textAlign: 'center', marginTop: 2 }}>{entry.tags[0]} {entry.tags.length > 1 ? `+${entry.tags.length - 1}` : ''}</div>
            )}
          </>
        )}
      </motion.div>
    );
  };

  return (
    <div className="app-shell" onClick={() => { clearSelection(); closeContextMenu(); }}>
      {/* ─── HEADER ─── */}
      <header className="header">
        <div className="header-logo"><FolderOpen size={20} color="var(--accent)" strokeWidth={2.5} /> FileOrganizer</div>
        <div className="header-search">
          <button 
            className="btn btn-ghost btn-icon" 
            style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', padding: 0, width: 26, height: 26, zIndex: 10 }}
            onClick={() => setSearchScope(prev => prev === 'global' ? 'local' : 'global')}
            title={searchScope === 'global' ? "Buscando en todo (Click para buscar solo aquí)" : "Buscando solo aquí (Click para buscar en todo)"}
          >
            {searchScope === 'global' ? <Globe size={14} color="var(--text-muted)" /> : <FolderSearch size={14} color="var(--text-muted)" />}
          </button>
          <Search size={14} className="header-search-icon" style={{ left: 36 }} />
          <input 
            type="text" 
            placeholder={searchScope === 'global' ? "Buscar en todo..." : "Buscar en esta carpeta..."}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 56 }}
          />
        </div>
        <div className="header-actions">
          <button 
            className={`btn btn-ghost btn-icon`} 
            onClick={() => !isScanningAE && doAction('scan-ae', {})} 
            title={isScanningAE ? 'Escaneando...' : 'Escanear proyectos de After Effects en esta carpeta'}
          >
            {isScanningAE ? <RefreshCw size={16} className="spin-animation" color="var(--accent)" /> : <Clapperboard size={16} color="var(--accent)" />}
          </button>
          <button className="btn btn-ghost btn-icon" onClick={() => setShowStats(true)} title="Estadísticas de disco"><BarChart2 size={16} /></button>
          <button className="btn btn-primary" style={{ padding: '0 12px', height: 30, fontSize: 11.5 }} onClick={() => setShowOrganize(true)}>
            <Wand2 size={13} /> Auto-Organizar
          </button>
        </div>
      </header>

      {/* ─── SIDEBAR ─── */}
      <aside className="sidebar">
        <div className="sidebar-scroll-area" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {/* ── Ubicaciones ── */}
          <SidebarSection title="Ubicaciones" defaultOpen>
            {[{ path: 'C:\\Users', label: 'Inicio', Icon: HomeIcon }, ...drives.map(d => ({ path: d, label: d, Icon: HardDrive }))].map(({ path, label, Icon }) => (
              <TreeNode
                key={path}
                path={path}
                label={label}
                Icon={Icon}
                isActive={currentPath === path}
                onNavigate={setCurrentPath}
              />
            ))}
          </SidebarSection>

          {/* ── Accesos Rápidos ── */}
          <SidebarSection title="Accesos Rápidos" defaultOpen>
            {quickAccess.map(qa => {
              let Icon = Folder;
              if (qa.name === 'Escritorio') Icon = Monitor;
              else if (qa.name === 'Descargas') Icon = ArrowDown;
              else if (qa.name === 'Documentos') Icon = FileText;
              else if (qa.name === 'Imágenes') Icon = ImageIcon;
              else if (qa.name === 'Videos') Icon = Film;
              else if (qa.name === 'Música') Icon = Music;
              return (
                <TreeNode
                  key={qa.path}
                  path={qa.path}
                  label={qa.name}
                  Icon={Icon}
                  isActive={currentPath === qa.path}
                  onNavigate={setCurrentPath}
                />
              );
            })}
          </SidebarSection>
        </div>

        {/* ── Papelera ── */}
        <div className="sidebar-section-title" style={{ marginTop: 4 }}>Papelera</div>
        <div className="sidebar-tree" style={{ flex: 'none', borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
          <div className="tree-item" onClick={() => setShowTrashModal(true)} 
               onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
               onDrop={handleTrashDrop}
               style={{ 
                 color: trashCount > 0 ? 'var(--danger)' : 'var(--text-secondary)', 
                 padding: '10px 12px', 
                 gap: 12, 
                 marginTop: 4,
                 borderRadius: 8, 
                 background: trashCount > 0 ? 'rgba(255, 68, 68, 0.08)' : 'transparent' 
               }}>
            <AnimatedTrashIcon count={trashCount} size={24} /> 
            <div className="tree-item-name" style={{ fontSize: 13, fontWeight: 600 }}>Papelera</div>
            {trashCount > 0 && (
              <span style={{ background: 'var(--danger)', color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{trashCount}</span>
            )}
          </div>
        </div>
      </aside>


      {/* ─── MAIN AREA ─── */}
      <main className="main-area" onContextMenu={e => e.preventDefault()}>
        <div className="path-input-row">
          <button className="btn btn-ghost btn-icon" onClick={goUp} disabled={!currentPath || currentPath.length <= 3}><ArrowUp size={16} /></button>
          <button className="btn btn-ghost btn-icon" onClick={refresh}><RefreshCw size={14} className={isLoading ? 'spinning' : ''} /></button>
          <input className="path-input" value={pathInput} onChange={e => setPathInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && setCurrentPath(pathInput)} />
        </div>

        {!showDuplicates && (
          <div className="toolbar">
          <div className="toolbar-group">
            <button className="btn btn-default" onClick={() => setShowMkdir(true)}><FolderPlus size={14} /> Nueva Carpeta</button>
            <button className="btn btn-ghost" onClick={() => setShowDuplicates(true)} title="Buscar Duplicados"><Copy size={16} /> Duplicados</button>
            <button className="btn btn-ghost" onClick={() => {
              const targets = selected.size > 0
                ? visualEntries.filter(e => selected.has(e.path) && !e.isDir)
                : visualEntries.filter(e => !e.isDir);
              setAITagEntries(targets);
            }} title="Etiquetar con IA" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Sparkles size={14} /> IA {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
          <div className="toolbar-divider" />
          {/* Sort controls */}
          <div className="toolbar-group">
            <span style={{ fontSize: 11, color: 'var(--text-muted)', userSelect: 'none' }}>Ordenar:</span>
            {(['name','type','size','created','modified'] as const).map(field => {
              const labels: Record<string,string> = { name:'Nombre', type:'Tipo', size:'Tamaño', created:'Creación', modified:'Modificado' };
              const active = sortBy === field;
              return (
                <button
                  key={field}
                  className={`btn btn-ghost sort-btn ${active ? 'active' : ''}`}
                  onClick={() => handleSort(field)}
                  title={`Ordenar por ${labels[field]}`}
                >
                  {labels[field]}
                  {active ? (sortDesc ? <SortDesc size={12}/> : <SortAsc size={12}/>) : null}
                </button>
              );
            })}
          </div>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            <button className={`btn btn-ghost btn-icon ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}><Grid size={16}/></button>
            <button className={`btn btn-ghost btn-icon ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')}><List size={16}/></button>
          </div>
          </div>
        )}

        <div className="file-content" ref={fileContentRef} onClick={clearSelection}>
          {showDuplicates ? (
            <DuplicateView 
              cwd={currentPath} 
              onClose={() => setShowDuplicates(false)} 
              onSuccess={() => { refresh(); fetchTrashCount(); }}
              onOpenLocation={(path) => doAction('open-location', { path })}
            />
          ) : (
            <>
              <AnimatePresence mode="popLayout">
            {listing?.entries.length === 0 && !searching && (
              <motion.div key="empty-state" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="empty-state">
                <FolderOpen size={48} color="var(--border)" />
                <div>Carpeta vacía</div>
              </motion.div>
            )}

            {/* List view column headers */}
            {viewMode === 'list' && (
              <motion.div key="list-header" className="file-list-header" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div style={{ width: 28 }} />{/* checkbox */}
                <div style={{ width: 32 }} />{/* icon */}
                {(['name','type','size','modified'] as const).map(field => {
                  const labels: Record<string,string> = { name:'Nombre', type:'Tipo', size:'Tamaño', modified:'Modificado' };
                  const active = sortBy === field;
                  return (
                    <div
                      key={field}
                      className={`file-list-header-col ${field === 'name' ? 'grow' : ''} ${active ? 'active' : ''}`}
                      onClick={() => handleSort(field)}
                    >
                      {labels[field]}
                      {active
                        ? (sortDesc ? <ArrowDown size={11}/> : <ArrowUp size={11}/>)
                        : <ArrowUpDown size={11} style={{ opacity: 0.3 }}/>}
                    </div>
                  );
                })}
              </motion.div>
            )}
            {viewMode === 'grid' ? (() => {
              const sliced = visualEntries.slice(0, visibleCount);
              const dirs        = sliced.filter(e => e.isDir);
              const coverFiles  = sliced.filter(e => !e.isDir && PREVIEWABLE.has(e.ext));
              const otherFiles  = sliced.filter(e => !e.isDir && !PREVIEWABLE.has(e.ext));


              return (
                <motion.div key="grid-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {dirs.length > 0 && <div className="file-grid">{dirs.map(e => renderGridCard(e))}</div>}
                  {coverFiles.length > 0 && (
                    <>
                      {dirs.length > 0 && <div className="grid-section-divider" />}
                      <div className="file-grid">{coverFiles.map(e => renderGridCard(e))}</div>
                    </>
                  )}
                  {otherFiles.length > 0 && (
                    <>
                      {(dirs.length > 0 || coverFiles.length > 0) && <div className="grid-section-divider" />}
                      <div className="file-grid">{otherFiles.map(e => renderGridCard(e))}</div>
                    </>
                  )}
                </motion.div>
              );
            })() : (
              /* ── LIST MODE ── */
              <motion.div key="list-view" className="file-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {visualEntries.slice(0, visibleCount).map((entry) => {
                  const isSelected = selected.has(entry.path);
                  const isEditing = inlineRenameEntry?.path === entry.path;
                  return (
                    <motion.div
                      layout
                      key={entry.path}
                      data-path={entry.path}
                      className={`file-list-item ${isSelected ? 'selected' : ''} ${focusedPath === entry.path ? 'focused' : ''}`}
                      draggable={true}
                      onDragStart={(e: any) => handleDragStart(e, entry)}
                      onDragOver={(e: any) => handleDragOver(e, entry)}
                      onDrop={(e: any) => handleDrop(e, entry)}
                      onClick={e => { e.stopPropagation(); setFocusedPath(entry.path); handleClick(e, entry); }}
                      onContextMenu={e => onContextMenu(e, entry)}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <FileCheckbox selected={isSelected} onToggle={() => toggleSelect(entry.path, { stopPropagation: () => {} } as any)} />
                      <FileListIcon entry={entry} />
                      {entry.color && (
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, marginRight: 8, flexShrink: 0 }} />
                      )}
                      {isEditing ? (
                        <div style={{ flex: 1 }}><InlineRenameInput entry={entry} onConfirm={handleInlineRename} onCancel={() => setInlineRenameEntry(null)} /></div>
                      ) : (
                        <div className="file-list-name" onDoubleClick={() => handleOpen(entry.path)} onClick={e => { e.stopPropagation(); setInlineRenameEntry(entry); }}>{entry.name}</div>
                      )}
                      {entry.tags && entry.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: 4, marginRight: 16 }}>
                          {entry.tags.map(t => <span key={t} className="badge">{t}</span>)}
                        </div>
                      )}
                      <div className="file-list-ext">{entry.ext.toUpperCase() || 'Carpeta'}</div>
                      <span className="file-list-size">{formatSize(entry.size)}</span>
                      <span className="file-list-date">{formatDate(entry.modified)}</span>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

          </AnimatePresence>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} style={{ height: 1 }} />
          {/* Counter when not all entries are visible */}
            {visibleCount < totalEntries && (
              <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: 11.5, color: 'var(--text-muted)' }}>
                Mostrando {Math.min(visibleCount, totalEntries)} de {totalEntries} — seguí bajando para ver más
              </div>
            )}
            </>
          )}
        </div>

        {/* ─── Scroll to Top Floating Button ─── */}
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              className="scroll-top-btn"
              onClick={() => fileContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 20 }}
              transition={{ type: 'spring', damping: 18, stiffness: 300 }}
              whileHover={{ scale: 1.15, boxShadow: '0 0 20px rgba(14,201,0,0.5)' }}
              whileTap={{ scale: 0.88, backgroundColor: 'var(--accent-light)' }}
              title="Volver arriba"
            >
              <ChevronsUp size={20} strokeWidth={2.5} />
            </motion.button>
          )}
        </AnimatePresence>
      </main>

      {/* ─── PACK PROGRESS MODAL ─── */}
      <AnimatePresence>
        {packState && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.85, y: 20 }}
              transition={{ type: 'spring', damping: 20, stiffness: 260 }}
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 420, maxWidth: '90vw', boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <motion.div animate={{ rotate: [0, -10, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}>
                  <Package size={28} color="var(--accent)" />
                </motion.div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Empaquetando Proyecto</div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{packState.message}</div>
                </div>
              </div>

              {/* Progress bar */}
              {packState.total > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                    <span>{packState.copied} de {packState.total} archivos</span>
                    <span>{Math.round((packState.copied / packState.total) * 100)}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', marginBottom: 16 }}>
                    <motion.div
                      style={{ height: '100%', background: 'linear-gradient(90deg, var(--accent), #a78bfa)', borderRadius: 99, originX: 0 }}
                      animate={{ width: `${(packState.copied / packState.total) * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </>
              )}

              {/* File list */}
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {packState.files.slice(Math.max(0, packState.files.findIndex(f => f.status === 'copying') - 3), packState.files.findIndex(f => f.status === 'copying') + 8 || packState.files.length).map((f, i) => {
                  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
                  const isVideo = ['mp4','mov','avi','mkv','webm','m4v'].includes(ext);
                  const isImage = ['jpg','jpeg','png','gif','webp','psd','ai','svg'].includes(ext);
                  const isAudio = ['mp3','wav','aac','ogg','flac'].includes(ext);
                  const icon = isVideo ? '🎬' : isImage ? '🖼️' : isAudio ? '🎵' : '📄';
                  return (
                    <motion.div
                      key={f.name + i}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px', borderRadius: 8,
                        background: f.status === 'copying' ? 'var(--accent-dim)' : 'transparent',
                        fontSize: 13 }}
                    >
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: f.status === 'pending' ? 0.4 : 1 }}>{f.name}</span>
                      {f.status === 'done' && <CheckCircle size={14} color="var(--success)" />}
                      {f.status === 'copying' && <RefreshCw size={14} className="spin-icon" color="var(--accent)" />}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── PACK SUCCESS MODAL ─── */}
      <AnimatePresence>
        {packDone && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}
            onClick={() => setPackDone(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.7, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: 20 }}
              transition={{ type: 'spring', damping: 18, stiffness: 220 }}
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 20, padding: 32, width: 460, maxWidth: '92vw', boxShadow: '0 30px 80px rgba(0,0,0,0.7)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}
            >
              {/* Package box inside green circle, icons flying in */}
              <PackAnimation />

              <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>¡Proyecto Empaquetado!</h2>
              <p style={{ margin: '0 0 20px', fontSize: 14, opacity: 0.6 }}>Todos los archivos fueron copiados exitosamente</p>

              {/* Stats row */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, justifyContent: 'center' }}>
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '10px 22px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{packDone.totalFiles}</div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>archivos</div>
                </div>
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '10px 22px', textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{formatSize(packDone.totalBytes)}</div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>copiados</div>
                </div>
              </div>

              {/* Destination path — with open folder button */}
              <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: '10px 12px', marginBottom: 22, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FolderOpen size={15} color="var(--accent)" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{packDone.destPath}</span>
                <motion.button
                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                  title="Abrir carpeta destino"
                  onClick={async () => {
                    try {
                      await fetch('/api/open-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: packDone.destPath }) });
                    } catch {}
                  }}
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center', flexShrink: 0, padding: '5px 7px', borderRadius: 7 }}
                >
                  <ExternalLink size={13} />
                </motion.button>
              </div>

              <motion.button
                whileHover={{ scale: 1.02, boxShadow: '0 0 20px rgba(14,201,0,0.4)' }} whileTap={{ scale: 0.97 }}
                onClick={() => setPackDone(null)}
                style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                ¡Genial!
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {contextMenu && (
          <ContextMenu 
            x={contextMenu.x} y={contextMenu.y} entry={contextMenu.entry}
            onClose={() => setContextMenu(null)}
            onRename={() => { setInlineRenameEntry(contextMenu.entry); setContextMenu(null); }}
            onDelete={() => { setDeleteEntry(contextMenu.entry); setContextMenu(null); }}
            onMkdir={() => { setShowMkdir(true); setContextMenu(null); }}
            onOpen={() => { if(contextMenu.entry) handleOpen(contextMenu.entry.path); setContextMenu(null); }}
            onPreview={() => { if(contextMenu.entry) setPreviewEntry(contextMenu.entry); setContextMenu(null); }}
            onOpenLocation={() => { if(contextMenu.entry) doAction('open-location', { path: contextMenu.entry.path }); setContextMenu(null); }}
            onMetadata={() => { if(contextMenu.entry) setShowMetadataEntry(contextMenu.entry); setContextMenu(null); }}
            onMoveTo={() => { if(contextMenu.entry) setShowMoveTo([contextMenu.entry.path]); setContextMenu(null); }}
            onUnzip={() => { if(contextMenu.entry) handleUnzip(contextMenu.entry.path); setContextMenu(null); }}
            aeLinkedProjects={contextMenu.entry ? aeLinks[contextMenu.entry.path] : undefined}
            onOpenAEProject={async (projPath) => {
              try {
                await fetch('/api/open-folder', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ filePath: projPath })
                });
                setContextMenu(null);
              } catch (e: any) {}
            }}
            sortBy={sortBy} sortDesc={sortDesc} onSort={handleSort}
            onPackProject={(p) => { setContextMenu(null); handlePackProject(p); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewEntry && (
          <PreviewModal 
            entry={previewEntry}
            allPreviewable={customPreviewList || (searchResults || listing?.entries || []).filter(e => !e.isDir && PREVIEWABLE.has(e.ext))}
            onClose={() => { setPreviewEntry(null); setCustomPreviewList(null); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteEntry && (
          <DeleteModal entry={deleteEntry} onCancel={() => setDeleteEntry(null)} onConfirm={() => { handleDelete([deleteEntry.path]); setDeleteEntry(null); }} />
        )}
        {showMkdir && (
          <MkdirModal onCancel={() => setShowMkdir(false)} onConfirm={name => { handleMkdir(name); setShowMkdir(false); }} />
        )}
      </AnimatePresence>

      {showOrganize && <OrganizeModal currentPath={currentPath} onClose={() => setShowOrganize(false)} toast={toast} />}
      {showStats && <StatsPanel path={currentPath} onClose={() => setShowStats(false)} renderGridCard={renderGridCard} />}

      {/* Trash Modal */}
      <AnimatePresence>
        {showTrashModal && (
          <TrashModal
            onClose={() => setShowTrashModal(false)}
            onRestore={() => { refresh(); fetchTrashCount(); }}
            toast={toast}
          />
        )}
      </AnimatePresence>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="bulk-action-bar"
          >
            <div className="bulk-count">{selected.size} seleccionados</div>
            <div className="bulk-actions">
              <button className="btn btn-ghost" onClick={() => handleZip(Array.from(selected))}>
                <FileArchive size={14} /> <span className="hide-mobile">ZIP</span>
              </button>
              <button className="btn btn-ghost" onClick={() => setShowMoveTo(Array.from(selected))}>
                <MoveRight size={14} /> <span className="hide-mobile">Mover a</span>
              </button>
              <button className="btn btn-ghost" onClick={() => handleDelete(Array.from(selected))} style={{ color: 'var(--danger)' }}>
                <Trash2 size={14} /> <span className="hide-mobile">Eliminar</span>
              </button>
              <button className="btn btn-ghost" onClick={clearSelection}>
                <X size={14} /> <span className="hide-mobile">Cancelar</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Move To Modal */}
      <AnimatePresence>
        {showMoveTo && (
          <MoveToModal
            sourcePaths={showMoveTo}
            onConfirm={handleMoveTo}
            onCancel={() => setShowMoveTo(null)}
          />
        )}
        
        {showMetadataEntry && (
          <MetadataModal
            entry={showMetadataEntry}
            onClose={() => setShowMetadataEntry(null)}
            onSave={(color, tags) => handleMetadataSave(showMetadataEntry, color, tags)}
          />
        )}
        {aiTagEntries && (
          <AITagModal
            entries={aiTagEntries}
            onClose={handleAITagClose}
            onTagsSaved={handleTagsSaved}
          />
        )}

      </AnimatePresence>

      {/* Toasts */}
      <div className="toast-container">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.9 }} className={`toast ${t.type}`}>
              {t.type === 'success' ? <CheckCircle size={18} className="toast-icon success" /> : t.type === 'error' ? <AlertCircle size={18} className="toast-icon error" /> : <Info size={18} />}
              <span style={{ fontSize: '13px', fontWeight: 500, flex: 1 }}>{t.message}</span>
              {t.type === 'success' && undoHistory.length > 0 && (
                <button 
                  onClick={(e) => { e.stopPropagation(); handleUndo(); }}
                  style={{ 
                    background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 4, 
                    color: 'inherit', padding: '4px 8px', fontSize: 12, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8
                  }}
                >
                  <Undo size={12} /> Deshacer
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
