'use client';

import { useState, useEffect, useCallback, useRef, useDeferredValue, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Folder, File, Image as ImageIcon, Film, Music, FileText, Archive, Code, HardDrive,
  Search, Grid, List, ChevronRight, HomeIcon, ArrowLeft, ArrowUp, ArrowDown, Plus,
  Trash2, Trash, Edit2, RefreshCw, BarChart2, Wand2, X, CheckCircle, AlertCircle, 
  Terminal, Monitor, Type, AlertTriangle, ArrowRight, Play, ZoomIn, ChevronLeft,
  Pause, Volume2, VolumeX, SkipBack, SkipForward, Maximize, FolderOpen, FileArchive,
  FolderPlus, MoveRight, Copy, CheckSquare, Square, ExternalLink, Info, MoreVertical,
  ChevronsUp, ArrowUpDown, SortAsc, SortDesc, Undo
} from 'lucide-react';
import { FileEntry, DirectoryListing, DiskStats, OrganizePreview } from '@/lib/types';
import { getFileTypeInfo, formatSize, formatDate } from '@/lib/file-types';
import { 
  InlineRenameInput, FileCheckbox, VideoThumb, ImageCover, DocCover, FileThumbnail, FileListIcon,
  VideoPlayer, PreviewModal, ContextMenu, RenameModal, DeleteModal, MkdirModal, BulkActionModal,
  BulkMoveModal, BulkDeleteModal, OrganizeModal, StatsPanel, useToast, MoveToModal, TrashModal, AnimatedTrashIcon
} from './components';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp', 'heic', 'tiff', 'tif']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'm4v']);
const DOC_EXTS = new Set(['pdf', 'psd']);
const PREVIEWABLE = new Set([...IMAGE_EXTS, ...VIDEO_EXTS, ...DOC_EXTS]);

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
      setTrashCount(data.count || 0);
    } catch {}
  }, []);

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
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&path=${encodeURIComponent(currentPath)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.entries || []);
        }
      } catch {}
      setIsSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, currentPath]);


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



  return (
    <div className="app-shell" onClick={() => { clearSelection(); closeContextMenu(); }}>
      {/* ─── HEADER ─── */}
      <header className="header">
        <div className="header-logo"><FolderOpen size={20} color="var(--accent)" strokeWidth={2.5} /> FileOrganizer</div>
        <div className="header-search">
          <Search size={14} className="header-search-icon" />
          <input 
            type="text" 
            placeholder="Buscar en todos lados..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost btn-icon" onClick={() => setShowStats(true)} title="Estadísticas de disco"><BarChart2 size={16} /></button>
          <button className="btn btn-primary" style={{ padding: '0 12px', height: 30, fontSize: 11.5 }} onClick={() => setShowOrganize(true)}>
            <Wand2 size={13} /> Auto-Organizar
          </button>
        </div>
      </header>

      {/* ─── SIDEBAR ─── */}
      <aside className="sidebar">
        <div className="sidebar-section-title">Ubicaciones</div>
        <div className="sidebar-tree">
          {/* Inicio */}
          {[{ path: 'C:\\Users', label: 'Inicio', Icon: HomeIcon }, ...drives.map(d => ({ path: d, label: d, Icon: HardDrive }))].map(({ path, label, Icon }) => {
            const isActive = currentPath === path;
            return (
              <div key={path} className="tree-item-wrap" onClick={() => setCurrentPath(path)}>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-pill"
                    className="tree-item-pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <motion.div
                  className={`tree-item ${isActive ? 'active no-bg' : ''}`}
                  whileTap={{ scale: 0.96 }}
                >
                  <motion.span
                    animate={{ scale: isActive ? 1.2 : 1, color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    style={{ display: 'flex', lineHeight: 1 }}
                  >
                    <Icon size={14} />
                  </motion.span>
                  <div className="tree-item-name">{label}</div>
                </motion.div>
              </div>
            );
          })}
        </div>

        <div className="sidebar-section-title">Accesos Rápidos</div>
        <div className="sidebar-tree">
          {quickAccess.map(qa => {
            let Icon = Folder;
            if (qa.name === 'Escritorio') Icon = Monitor;
            else if (qa.name === 'Descargas') Icon = ArrowDown;
            else if (qa.name === 'Documentos') Icon = FileText;
            else if (qa.name === 'Imágenes') Icon = ImageIcon;
            else if (qa.name === 'Videos') Icon = Film;
            else if (qa.name === 'Música') Icon = Music;
            const isActive = currentPath === qa.path;
            return (
              <div key={qa.path} className="tree-item-wrap" onClick={() => setCurrentPath(qa.path)}>
                {isActive && (
                  <motion.div
                    layoutId="sidebar-pill"
                    className="tree-item-pill"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  />
                )}
                <motion.div
                  className={`tree-item ${isActive ? 'active no-bg' : ''}`}
                  whileTap={{ scale: 0.96 }}
                >
                  <motion.span
                    animate={{ scale: isActive ? 1.2 : 1, color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    style={{ display: 'flex', lineHeight: 1 }}
                  >
                    <Icon size={14} />
                  </motion.span>
                  <div className="tree-item-name">{qa.name}</div>
                </motion.div>
              </div>
            );
          })}
        </div>

        <div className="sidebar-section-title">Papelera</div>
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

        <div className="toolbar">
          <div className="toolbar-group">
            <button className="btn btn-default" onClick={() => setShowMkdir(true)}><FolderPlus size={14} /> Nueva Carpeta</button>
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

        <div className="file-content" ref={fileContentRef} onClick={clearSelection}>
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

              const renderGridCard = (entry: typeof sliced[0]) => {
                const isSelected = selected.has(entry.path);
                const isReturning = returningItems.includes(entry.path);
                const isEditing = inlineRenameEntry?.path === entry.path;
                const isDoc = DOC_EXTS.has(entry.ext);
                const isImage = IMAGE_EXTS.has(entry.ext);
                const isVideo = VIDEO_EXTS.has(entry.ext);
                const useCoverLayout = !entry.isDir && (isImage || isVideo || isDoc);
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
                    {useCoverLayout ? (
                      <>
                        <div className="file-thumb-cover">
                          {isVideo && <VideoThumb src={`/api/preview?path=${encodeURIComponent(entry.path)}`} cover />}
                          {isImage && <ImageCover src={`/api/preview?path=${encodeURIComponent(entry.path)}`} name={entry.name} ext={entry.ext} />}
                          {isDoc && <DocCover src={entry.path} name={entry.name} ext={entry.ext} />}
                        </div>
                        <div className="video-card-info">
                          {isEditing ? (
                            <InlineRenameInput entry={entry} onConfirm={handleInlineRename} onCancel={() => setInlineRenameEntry(null)} />
                          ) : (
                            <div className="video-card-name" title={entry.name} onClick={e => { e.stopPropagation(); setInlineRenameEntry(entry); }}>{entry.name}</div>
                          )}
                          <div className="video-card-meta">{formatSize(entry.size)}</div>
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
                      </>
                    )}
                  </motion.div>
                );
              };

              return (
                <motion.div key="grid-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {dirs.length > 0 && <div className="file-grid">{dirs.map(renderGridCard)}</div>}
                  {coverFiles.length > 0 && (
                    <>
                      {dirs.length > 0 && <div className="grid-section-divider" />}
                      <div className="file-grid">{coverFiles.map(renderGridCard)}</div>
                    </>
                  )}
                  {otherFiles.length > 0 && (
                    <>
                      {(dirs.length > 0 || coverFiles.length > 0) && <div className="grid-section-divider" />}
                      <div className="file-grid">{otherFiles.map(renderGridCard)}</div>
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
                      {isEditing ? (
                        <div style={{ flex: 1 }}><InlineRenameInput entry={entry} onConfirm={handleInlineRename} onCancel={() => setInlineRenameEntry(null)} /></div>
                      ) : (
                        <span className="file-list-name" title={entry.name} onClick={e => { e.stopPropagation(); setInlineRenameEntry(entry); }}>{entry.name}</span>
                      )}
                      <span className="file-list-ext">{entry.ext}</span>
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

      {/* ─── MODALS ─── */}
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
            onMoveTo={() => { if(contextMenu.entry) setShowMoveTo([contextMenu.entry.path]); setContextMenu(null); }}
            onUnzip={() => { if(contextMenu.entry) handleUnzip(contextMenu.entry.path); setContextMenu(null); }}
            sortBy={sortBy} sortDesc={sortDesc} onSort={handleSort}
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
      {showStats && <StatsPanel path={currentPath} onClose={() => setShowStats(false)} />}

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
                <FileArchive size={14} /> Comprimir ZIP
              </button>
              <button className="btn btn-ghost" onClick={() => setShowMoveTo(Array.from(selected))}>
                <MoveRight size={14} /> Mover a
              </button>
              <button className="btn btn-ghost" onClick={() => handleDelete(Array.from(selected))} style={{ color: 'var(--danger)' }}>
                <Trash2 size={14} /> Eliminar
              </button>
              <button className="btn btn-ghost" onClick={clearSelection}>
                <X size={14} /> Cancelar
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
