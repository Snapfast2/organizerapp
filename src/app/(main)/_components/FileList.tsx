'use client';
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, ArrowDown, ArrowUp, ArrowUpDown, Clapperboard } from 'lucide-react';

import { FileEntry, DirectoryListing } from '@/lib/types';
import { DOC_EXTS, IMAGE_EXTS, VIDEO_EXTS, PREVIEWABLE, formatSize, formatDate } from '@/lib/file-types';
import type { SortField } from './FileToolbar';

// Components that need to be imported (assuming they are in components.tsx or similar)
import { 
  FileCheckbox, FileThumbnail, FileListIcon, InlineRenameInput,
  VideoThumb, ImageCover, DocCover
} from '@/app/components';

export interface FileListProps {
  entries: FileEntry[];
  totalEntries: number;
  visibleCount: number;
  viewMode: 'grid' | 'list';
  listing: DirectoryListing | null;
  searching: boolean;
  selected: Set<string>;
  focusedPath: string | null;
  inlineRenameEntry: FileEntry | null;
  returningItems: string[];
  aeLinks: Record<string, string[]>;
  sortBy: SortField;
  sortDesc: boolean;

  onToggleSelect: (path: string, e: React.MouseEvent) => void;
  onSetFocusedPath: (path: string | null) => void;
  onClickEntry: (e: React.MouseEvent, entry: FileEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: FileEntry) => void;
  onDragStart: (e: React.DragEvent, entry: FileEntry) => void;
  onDragOver: (e: React.DragEvent, entry: FileEntry) => void;
  onDrop: (e: React.DragEvent, entry: FileEntry) => void;
  onSort: (field: SortField) => void;
  onInlineRename: (filePath: string, newName: string) => void | Promise<void>;
  onSetInlineRenameEntry: (entry: FileEntry | null) => void;
}

const SORT_LABELS: Record<string, string> = { 
  name: 'Nombre', type: 'Tipo', size: 'Tamaño', modified: 'Modificado' 
};

export default function FileList({
  entries, totalEntries, visibleCount, viewMode, listing, searching,
  selected, focusedPath, inlineRenameEntry, returningItems, aeLinks,
  sortBy, sortDesc,
  onToggleSelect, onSetFocusedPath, onClickEntry, onContextMenu,
  onDragStart, onDragOver, onDrop, onSort, onInlineRename, onSetInlineRenameEntry
}: FileListProps) {

  // The renderGridCard function extracted from page.tsx
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
        onDragStart={(e: any) => onDragStart(e, entry)}
        onDragOver={(e: any) => onDragOver(e, entry)}
        onDrop={(e: any) => onDrop(e, entry)}
        onClick={e => { e.stopPropagation(); onSetFocusedPath(entry.path); onClickEntry(e, entry); }}
        onContextMenu={e => onContextMenu(e, entry)}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ 
          opacity: 1, scale: 1, 
          boxShadow: isReturning ? '0 0 15px rgba(0,255,100,0.6)' : 'none', 
          borderColor: isReturning ? 'rgba(0,255,100,0.8)' : 'transparent' 
        }}
        transition={{ duration: 0.15 }}
      >
        <FileCheckbox selected={isSelected} onToggle={(e) => onToggleSelect(entry.path, e)} />
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
                <InlineRenameInput entry={entry} onConfirm={(newName) => onInlineRename(entry.path, newName)} onCancel={() => onSetInlineRenameEntry(null)} />
              ) : (
                <div className="video-card-name" title={entry.name} onClick={e => { e.stopPropagation(); onSetInlineRenameEntry(entry); }}>{entry.name}</div>
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
              <InlineRenameInput entry={entry} onConfirm={(newName) => onInlineRename(entry.path, newName)} onCancel={() => onSetInlineRenameEntry(null)} />
            ) : (
              <div className="file-card-name" title={entry.name} onClick={e => { e.stopPropagation(); onSetInlineRenameEntry(entry); }}>{entry.name}</div>
            )}
            {entry.tags && entry.tags.length > 0 && (
              <div style={{ fontSize: 10, color: 'var(--accent)', textAlign: 'center', marginTop: 2 }}>{entry.tags[0]} {entry.tags.length > 1 ? `+${entry.tags.length - 1}` : ''}</div>
            )}
          </>
        )}
      </motion.div>
    );
  };

  // Group sliced entries for grid view
  const dirs = entries.filter(e => e.isDir);
  const coverFiles = entries.filter(e => !e.isDir && PREVIEWABLE.has(e.ext));
  const otherFiles = entries.filter(e => !e.isDir && !PREVIEWABLE.has(e.ext));

  return (
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
            {(['name', 'type', 'size', 'modified'] as const).map(field => {
              const active = sortBy === field;
              return (
                <div
                  key={field}
                  className={`file-list-header-col ${field === 'name' ? 'grow' : ''} ${active ? 'active' : ''}`}
                  onClick={() => onSort(field as SortField)}
                >
                  {SORT_LABELS[field]}
                  {active
                    ? (sortDesc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)
                    : <ArrowUpDown size={11} style={{ opacity: 0.3 }} />}
                </div>
              );
            })}
          </motion.div>
        )}

        {viewMode === 'grid' ? (
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
        ) : (
          /* ── LIST MODE ── */
          <motion.div key="list-view" className="file-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {entries.map((entry) => {
              const isSelected = selected.has(entry.path);
              const isEditing = inlineRenameEntry?.path === entry.path;
              return (
                <motion.div
                  layout
                  key={entry.path}
                  data-path={entry.path}
                  className={`file-list-item ${isSelected ? 'selected' : ''} ${focusedPath === entry.path ? 'focused' : ''}`}
                  draggable={true}
                  onDragStart={(e: any) => onDragStart(e, entry)}
                  onDragOver={(e: any) => onDragOver(e, entry)}
                  onDrop={(e: any) => onDrop(e, entry)}
                  onClick={e => { e.stopPropagation(); onSetFocusedPath(entry.path); onClickEntry(e, entry); }}
                  onContextMenu={e => onContextMenu(e, entry)}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <FileCheckbox selected={isSelected} onToggle={(e) => onToggleSelect(entry.path, e)} />
                  <FileListIcon entry={entry} />
                  {entry.color && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, marginRight: 8, flexShrink: 0 }} />
                  )}
                  {isEditing ? (
                    <div style={{ flex: 1 }}>
                      <InlineRenameInput entry={entry} onConfirm={(newName) => onInlineRename(entry.path, newName)} onCancel={() => onSetInlineRenameEntry(null)} />
                    </div>
                  ) : (
                    <div className="file-list-name" onClick={e => { e.stopPropagation(); onSetInlineRenameEntry(entry); }}>{entry.name}</div>
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

      {/* Counter when not all entries are visible */}
      {visibleCount < totalEntries && (
        <div style={{ textAlign: 'center', padding: '12px 0 4px', fontSize: 11.5, color: 'var(--text-muted)' }}>
          Mostrando {Math.min(visibleCount, totalEntries)} de {totalEntries} — seguí bajando para ver más
        </div>
      )}
    </>
  );
}
