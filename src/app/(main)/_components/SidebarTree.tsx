'use client';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, FolderOpen, ChevronRight, ChevronDown, Loader } from 'lucide-react';

// ─── TreeNode ─────────────────────────────────────────────────────────────────

export interface TreeNodeProps {
  path: string;
  label: string;
  Icon?: React.ElementType;
  isActive: boolean;
  onNavigate: (path: string) => void;
  depth?: number;
  isRoot?: boolean;
  onDropFiles?: (paths: string[], targetPath: string) => void;
  isExpandable?: boolean;
}

// A single node in the sidebar tree — arrow expands, label navigates (Magic UI style)
export function TreeNode({ path, label, Icon, isActive, onNavigate, depth = 0, isRoot = false, onDropFiles, isExpandable = true }: TreeNodeProps) {
  const [open, setOpen] = useState(false);
  const [childFolders, setChildFolders] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

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
          if (isExpandable && !open) toggle(e);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
          e.dataTransfer.dropEffect = 'move';
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.paths && data.paths.length > 0 && onDropFiles) {
              onDropFiles(data.paths, path);
            }
          } catch {}
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
          backgroundColor: isDragOver ? 'rgba(74,222,128,0.2)' : isActive ? 'rgba(74,222,128,0.1)' : 'transparent',
          position: 'relative',
          userSelect: 'none',
        }}
      >
        {/* Expand arrow */}
        {isExpandable ? (
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
        ) : (
          <div style={{ width: 14, height: 14, flexShrink: 0 }} />
        )}        {/* Folder icon */}
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
                    onDropFiles={onDropFiles}
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

// ─── SidebarSection ───────────────────────────────────────────────────────────

export interface SidebarSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function SidebarSection({ title, children, defaultOpen = true }: SidebarSectionProps) {
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
