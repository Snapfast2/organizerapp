'use client';

import { useState, useEffect, useCallback, useRef, useDeferredValue, useMemo, useReducer } from 'react';
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
import { getFileTypeInfo, formatSize, formatDate, IMAGE_EXTS, VIDEO_EXTS, DOC_EXTS, PREVIEWABLE } from '@/lib/file-types';
import { 
  InlineRenameInput, FileCheckbox, VideoThumb, ImageCover, DocCover, FileThumbnail,
  VideoPlayer, PreviewModal, ContextMenu, RenameModal, DeleteModal, MkdirModal,
  BulkMoveModal, BulkDeleteModal, OrganizeModal, StatsPanel, MetadataModal, useToast, MoveToModal, TrashModal, AnimatedTrashIcon, DuplicateView,
  AITagModal, AIStatusBar
} from '../components';
import ClickSpark from '@/components/ui/click-spark';
import AEProjectHub from '../ae-hub';



import PackAnimation from './_components/PackAnimation';


import { TreeNode, SidebarSection } from './_components/SidebarTree';
import FileToolbar, { type SortField } from './_components/FileToolbar';
import FileList from './_components/FileList';



export default function FileOrgApp() {

  // Navigation history â€” single useReducer so NAVIGATE/GO_BACK/GO_FORWARD always see fresh state
  type NavState = { history: string[]; index: number; current: string };
  type NavAction =
    | { type: 'NAVIGATE'; path: string }
    | { type: 'GO_BACK' }
    | { type: 'GO_FORWARD' };

  const navReducer = (state: NavState, action: NavAction): NavState => {
    switch (action.type) {
      case 'NAVIGATE': {
        const newHistory = [...state.history.slice(0, state.index + 1), action.path];
        return { history: newHistory, index: newHistory.length - 1, current: action.path };
      }
      case 'GO_BACK': {
        if (state.index <= 0) return state;
        const newIndex = state.index - 1;
        return { ...state, index: newIndex, current: state.history[newIndex] };
      }
      case 'GO_FORWARD': {
        if (state.index >= state.history.length - 1) return state;
        const newIndex = state.index + 1;
        return { ...state, index: newIndex, current: state.history[newIndex] };
      }
      default: return state;
    }
  };

  const [navState, dispatchNav] = useReducer(navReducer, {
    history: ['hub'], index: 0, current: 'hub'
  });
  const currentPath = navState.current;
  const navHistory = navState.history;
  const navIndex = navState.index;

  const navigate = useCallback((path: string) => dispatchNav({ type: 'NAVIGATE', path }), []);
  const goBack    = useCallback(() => dispatchNav({ type: 'GO_BACK' }), []);
  const goForward = useCallback(() => dispatchNav({ type: 'GO_FORWARD' }), []);

  const canGoBack    = navIndex > 0;
  const canGoForward = navIndex < navHistory.length - 1;

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

  // Video Hover state
  const [hoveredVideo, setHoveredVideo] = useState<string | null>(null);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, entry: FileEntry, isAEOpen?: boolean } | null>(null);
  const [showMoveTo, setShowMoveTo] = useState<string[] | null>(null); // paths to move
  const [showMetadataEntry, setShowMetadataEntry] = useState<FileEntry | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [aiTagEntries, setAITagEntries] = useState<FileEntry[] | null>(null);
  const [aeLinks, setAeLinks] = useState<Record<string, string[]>>({});
  const [isScanningAE, setIsScanningAE] = useState(false);
  const closeContextMenu = () => setContextMenu(null);
  
  // Toasts â€” using the shared useToast hook from components.tsx
  const { toasts, toast } = useToast();

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
  const [sortBy, setSortBy] = useState<SortField>('name');
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
    if (currentPath === 'hub') return;
    if (currentPath.length > 3) {
      const parent = currentPath.substring(0, currentPath.lastIndexOf('\\')) || currentPath.substring(0, 3);
      navigate(parent);
    }
  };

  // Toggle sort column: same field â†’ flip direction, new field â†’ asc
  const handleSort = useCallback((field: SortField) => {
    if (sortBy === field) {
      setSortDesc(d => !d);
    } else {
      setSortBy(field);
      setSortDesc(false);
    }
  }, [sortBy]);

  // Ref to the active pack polling interval â€” cleared on unmount or when pack finishes
  const packIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (packIntervalRef.current) clearInterval(packIntervalRef.current);
    };
  }, []);

  const handlePackProject = async (aepPath: string) => {
    setPackState({ path: aepPath, copied: 0, total: 0, message: 'Iniciando...', files: [] });
    let mounted = true;
    try {
      // 1. Start the job
      const startRes = await fetch('/api/ae-collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aepPath })
      });
      const { jobId, error: startError } = await startRes.json();
      if (startError) throw new Error(startError);

      // 2. Poll every 300ms â€” interval stored in ref so it can be cleared on unmount
      await new Promise<void>((resolve, reject) => {
        packIntervalRef.current = setInterval(async () => {
          if (!mounted) {
            if (packIntervalRef.current) clearInterval(packIntervalRef.current);
            return;
          }
          try {
            const pollRes = await fetch(`/api/ae-collect?jobId=${jobId}`);
            const data = await pollRes.json();

            if (data.error) {
              clearInterval(packIntervalRef.current!);
              reject(new Error(data.error));
              return;
            }

            if (mounted) {
              setPackState({
                path: aepPath,
                message: data.message,
                copied: data.copied,
                total: data.total,
                files: data.files || [],
              });
            }

            if (data.state === 'done') {
              clearInterval(packIntervalRef.current!);
              const finalFiles = data.files || [];
              if (mounted) {
                setPackState(null);
                refresh();
                setPackDone({ totalFiles: data.copied, totalBytes: data.totalBytes ?? 0, destPath: data.destPath, files: finalFiles });
              }
              resolve();
            } else if (data.state === 'error') {
              clearInterval(packIntervalRef.current!);
              reject(new Error(data.error));
            }
          } catch (e: any) {
            clearInterval(packIntervalRef.current!);
            reject(e);
          }
        }, 300);
      });
    } catch (err: any) {
      if (mounted) {
        alert('Fallo al empaquetar: ' + err.message);
        setPackState(null);
      }
    } finally {
      mounted = false;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty â€” callback uses only stable setState, sentinel ref checked above

  // Reset visible count when navigating to a new folder
  useEffect(() => { setVisibleCount(100); }, [currentPath]);

  const handleClick = (e: React.MouseEvent, entry: FileEntry) => {
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(entry.path, e);
      return;
    }
    if (entry.isDir) {
      navigate(entry.path);
    } else {
      if (PREVIEWABLE.has(entry.ext)) {
        setPreviewEntry(entry);
      } else {
        handleOpen(entry.path);
      }
    }
  };

  const onContextMenu = async (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    let isAEOpen = false;
    try {
      if (isElectron && (window as any).electronAPI) {
        isAEOpen = await (window as any).electronAPI.isAEOpen();
      }
    } catch (err) {}
    setContextMenu({ x: e.clientX, y: e.clientY, entry, isAEOpen });
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
  const [isElectron, setIsElectron] = useState(false);

  // Detect Electron after mount (preload injects window.electronAPI client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      setIsElectron(true);
    }
  }, []);
  
  const [inlineRenameEntry, setInlineRenameEntry] = useState<FileEntry | null>(null);

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
    if (!currentPath || currentPath === 'hub') return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/fs?path=${encodeURIComponent(currentPath)}`);
      if (res.ok) {
        const data = await res.json();
        setListing(data);
        setSearchResults(null);
      } else {
        const errData = await res.json().catch(() => ({}));
        toast(`Error al abrir: ${errData.error || 'Directorio no accesible'}`, 'error');
        if (currentPath !== 'C:\\') {
          navigate('C:\\');
        }
      }
    } catch {
      toast('Error al leer el directorio', 'error');
    } finally {
      setIsLoading(false);
      fetchTrashCount();
    }
  }, [currentPath, fetchTrashCount, navigate, toast]);

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

  // Called when AITagModal closes â€” refresh to show new tags on file cards
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
        const rootPath = searchScope === 'global' ? 'C:\\' : (currentPath === 'hub' ? 'E:\\Motion' : currentPath);
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
      toast('AcciÃ³n deshecha exitosamente', 'success');
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
      toast('Archivo extraÃ­do exitosamente', 'success');
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
            if (entry.isDir) navigate(entry.path);
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

  const handleTreeNodeDrop = async (paths: string[], destPath: string) => {
    const pathsToMove = paths.filter(p => p !== destPath);
    if (pathsToMove.length === 0) return;
    try {
      const res = await fetch('/api/fs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move', paths: pathsToMove, destPath: destPath })
      });
      if (res.ok) {
        const d = await res.json();
        if (d.undoAction) setUndoHistory(prev => [...prev, d.undoAction]);
        refresh();
        const destName = destPath.split('\\').pop() || destPath;
        toast(`Movidos ${pathsToMove.length} items a ${destName}`, 'success');
        clearSelection();
      } else {
        const err = await res.json();
        toast(`Error al mover: ${err.error || 'Desconocido'}`, 'error');
      }
    } catch (e: any) {
      toast(`Error de red al mover items`, 'error');
    }
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

  const toggleSelect = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
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
    <ClickSpark sparkColor="#4ade80" sparkSize={6} sparkRadius={20} sparkCount={4} duration={300} extraScale={0.6}>
      <div className={`app-shell${isElectron ? ' has-titlebar' : ''}`} onClick={() => { clearSelection(); closeContextMenu(); }}>

      {/* â”€â”€â”€ ELECTRON TITLE BAR (Discord style) â”€â”€â”€ */}
      {isElectron && (
        <div className="electron-titlebar">
          {/* Left: back / forward */}
          <div className="titlebar-nav">
            <button
              className="titlebar-nav-btn"
              onClick={goBack}
              disabled={!canGoBack}
              title="AtrÃ¡s"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              className="titlebar-nav-btn"
              onClick={goForward}
              disabled={!canGoForward}
              title="Adelante"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Center: icon + name */}
          <div className="titlebar-center">
            <FolderOpen size={14} color="var(--accent)" strokeWidth={2.5} />
            <span>FileOrganizer</span>
          </div>

          {/* Right: window controls */}
          <div className="titlebar-win-controls">
            <button className="titlebar-win-btn titlebar-minimize" onClick={() => (window as any).electronAPI.minimize()} title="Minimizar">
              <span />
            </button>
            <button className="titlebar-win-btn titlebar-maximize" onClick={() => (window as any).electronAPI.maximize()} title="Maximizar">
              <span />
            </button>
            <button className="titlebar-win-btn titlebar-close" onClick={() => (window as any).electronAPI.close()} title="Al tray">
              <span /><span />
            </button>
          </div>
        </div>
      )}

      {/* â”€â”€â”€ HEADER â”€â”€â”€ */}
      <header className="header">
        {!isElectron && <div className="header-logo"><FolderOpen size={20} color="var(--accent)" strokeWidth={2.5} /> FileOrganizer</div>}
        <div className="header-search">
          <button 
            className="btn btn-ghost btn-icon" 
            style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', padding: 0, width: 26, height: 26, zIndex: 10 }}
            onClick={() => setSearchScope(prev => prev === 'global' ? 'local' : 'global')}
            title={searchScope === 'global' ? "Buscando en todo (Click para buscar solo aquÃ­)" : "Buscando solo aquÃ­ (Click para buscar en todo)"}
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
          <button className="btn btn-ghost btn-icon" onClick={() => setShowStats(true)} title="EstadÃ­sticas de disco"><BarChart2 size={16} /></button>
          <button className="btn btn-primary" style={{ padding: '0 12px', height: 30, fontSize: 11.5 }} onClick={() => setShowOrganize(true)}>
            <Wand2 size={13} /> Auto-Organizar
          </button>
        </div>
      </header>

      {/* â”€â”€â”€ SIDEBAR â”€â”€â”€ */}
      <aside className="sidebar">
        <div className="sidebar-scroll-area" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {/* â”€â”€ NavegaciÃ³n â”€â”€ */}
          <SidebarSection title="NavegaciÃ³n" defaultOpen>
            <TreeNode
              key="hub"
              path="hub"
              label="Hub de Proyectos"
              Icon={Clapperboard}
              isActive={currentPath === 'hub'}
              onNavigate={navigate}
              isExpandable={false}
            />
            <TreeNode
              key="explorer"
              path="E:\\Motion"
              label="Explorador de Archivos"
              Icon={FolderOpen}
              isActive={currentPath !== 'hub'}
              onNavigate={navigate}
              isExpandable={false}
            />
          </SidebarSection>

          {/* â”€â”€ Ubicaciones â”€â”€ */}
          <SidebarSection title="Ubicaciones" defaultOpen>
            {drives.map(d => (
              <TreeNode
                key={d}
                path={d}
                label={d}
                Icon={HardDrive}
                isActive={currentPath === d}
                onNavigate={navigate}
                onDropFiles={handleTreeNodeDrop}
              />
            ))}
          </SidebarSection>

          {/* â”€â”€ Accesos RÃ¡pidos â”€â”€ */}
          <SidebarSection title="Accesos RÃ¡pidos" defaultOpen>
            {quickAccess.map(qa => {
              let Icon = Folder;
              if (qa.name === 'Escritorio') Icon = Monitor;
              else if (qa.name === 'Descargas') Icon = ArrowDown;
              else if (qa.name === 'Documentos') Icon = FileText;
              else if (qa.name === 'ImÃ¡genes') Icon = ImageIcon;
              else if (qa.name === 'Videos') Icon = Film;
              else if (qa.name === 'MÃºsica') Icon = Music;
              return (
                <TreeNode
                  key={qa.path}
                  path={qa.path}
                  label={qa.name}
                  Icon={Icon}
                  isActive={currentPath === qa.path}
                  onNavigate={navigate}
                  onDropFiles={handleTreeNodeDrop}
                />
              );
            })}
          </SidebarSection>
        </div>

        {/* â”€â”€ Papelera â”€â”€ */}
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


      {/* â”€â”€â”€ MAIN AREA â”€â”€â”€ */}
      <main className="main-area" onContextMenu={e => e.preventDefault()}>
        {currentPath === 'hub' ? (
          <AEProjectHub navigate={navigate} toast={toast} />
        ) : (
          <>
        <FileToolbar
          currentPath={currentPath}
          pathInput={pathInput}
          isLoading={isLoading}
          viewMode={viewMode}
          sortBy={sortBy}
          sortDesc={sortDesc}
          showDuplicates={showDuplicates}
          selectedCount={selected.size}
          onPathInputChange={setPathInput}
          onNavigate={navigate}
          onGoUp={goUp}
          onRefresh={refresh}
          onSort={handleSort}
          onSetViewMode={setViewMode}
          onNewFolder={() => setShowMkdir(true)}
          onShowDuplicates={() => setShowDuplicates(true)}
          onAITag={() => {
            const targets = selected.size > 0
              ? visualEntries.filter(e => selected.has(e.path) && !e.isDir)
              : visualEntries.filter(e => !e.isDir);
            setAITagEntries(targets);
          }}
        />
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
              <FileList
                entries={visualEntries.slice(0, visibleCount)}
                totalEntries={totalEntries}
                visibleCount={visibleCount}
                viewMode={viewMode}
                listing={listing}
                searching={searching}
                selected={selected}
                focusedPath={focusedPath}
                inlineRenameEntry={inlineRenameEntry}
                returningItems={returningItems}
                aeLinks={aeLinks}
                sortBy={sortBy}
                sortDesc={sortDesc}
                onToggleSelect={toggleSelect}
                onSetFocusedPath={setFocusedPath}
                onClickEntry={handleClick}
                onContextMenu={onContextMenu}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onSort={handleSort}
                onInlineRename={handleInlineRename}
                onSetInlineRenameEntry={setInlineRenameEntry}
              />
            </>
          )}
        </div>

        {/* â”€â”€â”€ Scroll to Top Floating Button â”€â”€â”€ */}
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
          </>
        )}
      </main>

      {/* â”€â”€â”€ PACK PROGRESS MODAL â”€â”€â”€ */}
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
                  const icon = isVideo ? 'ðŸŽ¬' : isImage ? 'ðŸ–¼ï¸' : isAudio ? 'ðŸŽµ' : 'ðŸ“„';
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

      {/* â”€â”€â”€ PACK SUCCESS MODAL â”€â”€â”€ */}
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

              <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700 }}>Â¡Proyecto Empaquetado!</h2>
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

              {/* Destination path â€” with open folder button */}
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
                Â¡Genial!
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
            onImportAE={contextMenu.isAEOpen ? (p) => {
              setContextMenu(null);
              if (isElectron && (window as any).electronAPI) {
                (window as any).electronAPI.popupImportAE(p);
                toast('Importando a After Effects...', 'success');
              }
            } : undefined}
            onRegisterInHub={async (aepPath) => {
              try {
                const res = await fetch('/api/ae-hub', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'register-project', filePath: aepPath })
                });
                const data = await res.json();
                if (res.ok) {
                  toast(data.alreadyRegistered ? 'âœ“ Ya estaba en el Hub (movido al top)' : 'âœ“ Proyecto agregado al Hub', 'success');
                } else {
                  toast(data.error || 'Error al registrar', 'error');
                }
              } catch {
                toast('Error de red', 'error');
              }
            }}
            onMoveToMotion={async (aepPath) => {
              try {
                const res = await fetch('/api/ae-hub', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'migrate-project', filePath: aepPath, targetDirectory: 'E:\\Motion' })
                });
                const data = await res.json();
                if (res.ok) {
                  const assetMsg = data.copiedAssets > 0 ? `, ${data.copiedAssets} asset(s) copiados` : '';
                  toast(`âœ“ Movido a E:\\Motion${assetMsg}`, 'success');
                  if (data.relinkScript) {
                    const api = (window as any).electronAPI;
                    api?.aeRunRelinkScript?.(data.relinkScript);
                  }
                  // Navigate to the new project folder
                  navigate(data.projectFolder);
                } else {
                  toast(data.error || 'Error al mover', 'error');
                }
              } catch {
                toast('Error de red', 'error');
              }
            }}
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
      {showStats && <StatsPanel path={currentPath} onClose={() => setShowStats(false)}  />}

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
            onSave={(color: string | null, tags: string[]) => handleMetadataSave(showMetadataEntry, color || undefined, tags)}
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
    </ClickSpark>
  );
}

