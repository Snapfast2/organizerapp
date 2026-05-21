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
  ChevronsUp, ArrowUpDown, SortAsc, SortDesc
} from 'lucide-react';
import { FileEntry, DirectoryListing, DiskStats, OrganizePreview } from '@/lib/types';
import { getFileTypeInfo, formatSize, formatDate } from '@/lib/file-types';
import { 
  InlineRenameInput, FileCheckbox, VideoThumb, ImageCover, DocCover, FileThumbnail, FileListIcon,
  VideoPlayer, PreviewModal, ContextMenu, RenameModal, DeleteModal, MkdirModal, BulkActionModal,
  BulkMoveModal, BulkDeleteModal, OrganizeModal, StatsPanel, useToast
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

  const handleClick = (entry: FileEntry) => {
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

  const handleInlineRename = async (newName: string) => {
    if (!inlineRenameEntry || newName === inlineRenameEntry.name) {
      setInlineRenameEntry(null);
      return;
    }
    const oldPath = inlineRenameEntry.path;
    const basePath = oldPath.substring(0, oldPath.lastIndexOf('\\'));
    const newPath = `${basePath}\\${newName}${inlineRenameEntry.ext ? '.' + inlineRenameEntry.ext : ''}`;
    
    try {
      await doAction('rename', { paths: [oldPath], newPath });
    } catch {}
    setInlineRenameEntry(null);
  };

  const handleMkdir = async (name: string) => {
    try {
      await doAction('mkdir', { path: `${currentPath}\\${name}` });
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
          setSearchResults(data.results || []);
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

  useEffect(() => {

    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoHistory, refresh, toast]);

  const doAction = async (action: string, payload: any) => {
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

  const clearSelection = () => {
    setSelected(new Set());
    if (editingPath) commitRename();
  };

  const handleOpen = async (path: string) => {
    try {
      await doAction('open', { path });
    } catch {}
  };



  const handleDelete = async (paths: string[]) => {
    try {
      const res = await fetch('/api/fs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', paths })
      });
      if (!res.ok) throw new Error('Bulk delete failed');
      const data = await res.json();
      
      setUndoHistory(prev => [...prev, {
        type: 'delete',
        items: paths.map((p, i) => ({ originalPath: p, newPath: '', trashPath: data.trashPaths[i] }))
      }]);
      
      toast(paths.length === 1 ? 'Archivo enviado a la papelera' : `${paths.length} archivos enviados a la papelera`, 'success');
      clearSelection();
      refresh();
    } catch {
      toast('Error al eliminar', 'error');
    }
  };

  // Modals state
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [showOrgModal, setShowOrgModal] = useState(false);

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
          <div className="tree-item" onClick={() => setShowTrashModal(true)} style={{ color: 'var(--danger)' }}>
            <Trash size={14} /> 
            <div className="tree-item-name">Papelera</div>
            {trashCount > 0 && (
              <span style={{ background: 'var(--danger-bg)', padding: '2px 6px', borderRadius: 10, fontSize: 10 }}>{trashCount}</span>
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="empty-state">
                <FolderOpen size={48} color="var(--border)" />
                <div>Carpeta vacía</div>
              </motion.div>
            )}

            {/* List view column headers */}
            {viewMode === 'list' && (
              <div className="file-list-header">
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
              </div>
            )}
            {viewMode === 'grid' ? (() => {
              const sliced = displayedEntries.slice(0, visibleCount);
              const dirs        = sliced.filter(e => e.isDir);
              const coverFiles  = sliced.filter(e => !e.isDir && (IMAGE_EXTS.has(e.ext) || VIDEO_EXTS.has(e.ext) || DOC_EXTS.has(e.ext)));
              const otherFiles  = sliced.filter(e => !e.isDir && !IMAGE_EXTS.has(e.ext) && !VIDEO_EXTS.has(e.ext) && !DOC_EXTS.has(e.ext));

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
                    className={`file-card ${isSelected ? 'selected' : ''} ${useCoverLayout ? 'video-card' : ''}`}
                    onClick={e => { e.stopPropagation(); handleClick(entry); }}
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
                            <div className="video-card-name" title={entry.name} onClick={e => { if(isSelected){ e.stopPropagation(); setInlineRenameEntry(entry); } }}>{entry.name}</div>
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
                          <div className="file-card-name" title={entry.name} onClick={e => { if(isSelected){ e.stopPropagation(); setInlineRenameEntry(entry); } }}>{entry.name}</div>
                        )}
                      </>
                    )}
                  </motion.div>
                );
              };

              return (
                <>
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
                </>
              );
            })() : (
              /* ── LIST MODE ── */
              <div className="file-list">
                {displayedEntries.slice(0, visibleCount).map((entry) => {
                  const isSelected = selected.has(entry.path);
                  const isEditing = inlineRenameEntry?.path === entry.path;
                  return (
                    <motion.div
                      layout
                      key={entry.path}
                      className={`file-list-item ${isSelected ? 'selected' : ''}`}
                      onClick={e => { e.stopPropagation(); handleClick(entry); }}
                      onContextMenu={e => onContextMenu(e, entry)}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <FileCheckbox selected={isSelected} onToggle={() => toggleSelect(entry.path, { stopPropagation: () => {} } as any)} />
                      <FileListIcon entry={entry} />
                      {isEditing ? (
                        <div style={{ flex: 1 }}><InlineRenameInput entry={entry} onConfirm={handleInlineRename} onCancel={() => setInlineRenameEntry(null)} /></div>
                      ) : (
                        <span className="file-list-name" title={entry.name} onClick={e => { if(isSelected){ e.stopPropagation(); setInlineRenameEntry(entry); } }}>{entry.name}</span>
                      )}
                      <span className="file-list-ext">{entry.ext}</span>
                      <span className="file-list-size">{formatSize(entry.size)}</span>
                      <span className="file-list-date">{formatDate(entry.modified)}</span>
                    </motion.div>
                  );
                })}
              </div>
            )}

          </AnimatePresence>
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

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="bulk-action-bar"
          >
            <div className="bulk-count">{selected.size} seleccionados</div>
            <div className="bulk-actions">
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

      {/* Toasts */}
      <div className="toast-container">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.9 }} className={`toast ${t.type}`}>
              {t.type === 'success' ? <CheckCircle size={18} className="toast-icon success" /> : t.type === 'error' ? <AlertCircle size={18} className="toast-icon error" /> : <Info size={18} />}
              <span style={{ fontSize: '13px', fontWeight: 500 }}>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
