import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Clapperboard, Plus, FolderOpen, Trash2, Edit2, ExternalLink, Calendar, 
  HardDrive, Link2, FolderPlus, Loader, Play, X, Folder, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import FolderComponent from './Folder';

interface RecentProject {
  path: string;
  name: string;
  lastOpened: string;
  size?: number;
  dependencyCount?: number;
  exists?: boolean;
  colorLabel?: string;
  projectFolder?: string;
}

// AE-style label system (matches AE's built-in labels)
const AE_LABELS = [
  { id: 'none',   color: '#444444', name: 'Sin etiqueta' },
  { id: 'red',    color: '#E8406B', name: 'En Progreso'  },
  { id: 'yellow', color: '#E8C540', name: 'En Revisión'  },
  { id: 'green',  color: '#3ED47A', name: 'Entregado'    },
  { id: 'blue',   color: '#4DA9FF', name: 'Archivado'    },
  { id: 'purple', color: '#9B59F5', name: 'Referencia'   },
  { id: 'pink',   color: '#F55FAD', name: 'Pendiente'    },
];

function getLabelColor(labelId?: string): string {
  return AE_LABELS.find(l => l.id === labelId)?.color ?? AE_LABELS[0].color;
}

// Inline AEP file icon with dynamic color
function AepIcon({ color, size = 36 }: { color: string; size?: number }) {
  const dark = color === '#444444' ? '#111' : color + '22';
  return (
    <svg width={size} height={Math.round(size * 1.22)} viewBox="0 0 80.4 98.4" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Card body */}
      <path d="M78.8,25.6V87c0,5.2-4.2,9.4-9.4,9.4H11.1c-5.2,0-9.4-4.2-9.4-9.4V11.5c0-5.2,4.2-9.4,9.4-9.4h44.1c2.5,0,4.9,1,6.7,2.7L76,18.9C77.8,20.7,78.8,23.1,78.8,25.6z" fill="#0a0a0a"/>
      {/* Border / accent */}
      <path d="M55.8,4.1c1.5,0,3,.6,4.1,1.7l14.7,14.7c1.1,1.1,1.7,2.5,1.7,4.1v64c0,3.2-2.6,5.7-5.7,5.7H9.8c-3.2,0-5.7-2.6-5.7-5.7V9.8c0-3.2,2.6-5.7,5.7-5.7H55.8 M55.8,0h-46C4.4,0,0,4.4,0,9.8v78.8c0,5.5,4.4,9.8,9.8,9.8h60.7c5.5,0,9.8-4.4,9.8-9.8v-64c0-2.6-1-5.1-2.9-7L62.8,2.9C60.9,1,58.4,0,55.8,0L55.8,0z" fill={color}/>
      {/* Ae lettering */}
      <path d="M34.7,45.1h-11l-2.8,7.8c0,.3-.2.4-.5.4h-5.2c-.3,0-.5-.2-.4-.5l10-29.2c.3-.9.4-1.8.4-2.7 c0-.2.1-.3.3-.3h7.2c.2,0,.3.1.4.2l11.2,32.1c.1.3,0,.5-.2.5h-5.8c-.2,0-.4-.1-.5-.3L34.7,45.1z M24.9,39.4h8.6c-.2-.5-4.1-12.8-4.3-13.8h0L24.9,39.4z M60,42.9h-8.9c0,2.1.6,3.7,1.8,4.9c1.1,1.2,2.8,1.8,5.1,1.8 c1.9,0,3.9-.3,5.7-1.1c.2-.1.3-.1.3.2v3.6c0,.2-.1.5-.3.6c-1.8.9-4.3,1.3-7,1.3c-4,0-6.9-1.1-8.8-3.4 c-1.9-2.3-2.8-5.2-2.8-8.6c0-3.6,1-6.6,2.9-9c2-2.4,4.6-3.6,8-3.6c3.2,0,5.6,1,7.2,3c1.6,2,2.4,4.4,2.4,7c0,.9,0,1.9-.2,2.8 c0,.2-.2.4-.4.4C63.4,42.9,61.7,42.9,60,42.9z M51.1,39.1h6.4c.8,0,1.6,0,2.4-.1c0-.2,0-.5,0-.7c0-1.2-.3-2.3-1-3.3 c-.7-1-1.7-1.5-3.2-1.5c-1.3-.1-2.5.5-3.3,1.6C51.7,36.3,51.2,37.7,51.1,39.1L51.1,39.1z" fill={color}/>
      {/* AEP text small */}
      <path d="M31.3,80.4h-4.6l-1.2,3.9c0,.1-.1.2-.2.2h-2.1c-.1,0-.2-.1-.2-.2L27.2,71 c.1-.4.2-.8.2-1.2c0-.1,0-.1.1-.1h3c.1,0,.1,0,.2.1l4.7,14.4c0,.1,0,.2-.1.2h-2.4c-.1,0-.2,0-.2-.1 L31.3,80.4z M27.2,77.9h3.6c-.1,0-1.7-5.5-1.8-5.9h0C28.8,72.8,28.2,74.9,27.2,77.9z M45.1,82.2l-.3,2.1c0,.1-.1.2-.2.2h-7.5c-.1,0-.2,0-.2-.2V69.9c0-.1,0-.2.1-.2h7.6c.1,0,.2,0,.2.2l.2,2.1c0,.1,0,.2-.2.2h-5.6v4.1h4.8 c.1,0,.2,0,.2.1v2.1c0,.1,0,.2-.2.2h-4.8V82H45C45.1,82,45.1,82.1,45.1,82.2z M46.8,84.3V69.9 c0-.1,0-.2.1-.2c.9,0,2.3,0,4,0c2,0,3.4.5,4.3,1.4c.9.9,1.4,2.1,1.4,3.4c0,1.6-.6,3-1.7,3.9c-1.3.9-2.8,1.3-4.3,1.2 h-.7c-.3,0-.7,0-.7,0v4.8c0,.1,0,.2-.2.2h-2.1C46.8,84.5,46.8,84.5,46.8,84.3C46.8,84.4,46.8,84.4,46.8,84.3z M49.2,72.2 v4.9c.5,0,.9,0,1.5,0c.8,0,1.6-.2,2.3-.7c.6-.5.9-.9.9-2c0-1.8-2.1-2.3-3-2.3C50.1,72.2,49.6,72.1,49.2,72.2z" fill="#ffffff"/>
    </svg>
  );
}

interface VisualGroup {
  id: string;
  name: string;
  projectPaths: string[];
}

interface AEProjectHubProps {
  navigate: (path: string) => void;
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function AEProjectHub({ navigate, toast }: AEProjectHubProps) {
  const [loading, setLoading] = useState(true);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [groups, setGroups] = useState<VisualGroup[]>([]);
  
  // Modals / Dialog states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDir, setProjectDir] = useState('E:\\Motion');
  const [creating, setCreating] = useState(false);
  const [motionSubfolders, setMotionSubfolders] = useState<string[]>([]);
  const [loadingSubfolders, setLoadingSubfolders] = useState(false);
  const BASE_DIR = 'E:\\Motion';

  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renamingGroupName, setRenamingGroupName] = useState('');

  const [migratingPath, setMigratingPath] = useState<string | null>(null);

  // Drag and drop target group ID
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  
  // Color label picker open for project path
  const [labelPickerFor, setLabelPickerFor] = useState<string | null>(null);
  const [labelPickerPos, setLabelPickerPos] = useState<{ x: number; y: number; above: boolean }>({ x: 0, y: 0, above: false });

  // Toggle states for grouped lists
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const fetchHubData = useCallback(async () => {
    try {
      const res = await fetch('/api/ae-hub');
      if (res.ok) {
        const data = await res.json();
        setRecentProjects(data.recentProjects || []);
        setGroups(data.groups || []);
      } else {
        toast('Error al cargar datos del Hub', 'error');
      }
    } catch {
      toast('Error de conexión con el Hub', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchHubData();
  }, [fetchHubData]);

  // Actions
  const handleOpenProject = async (path: string) => {
    try {
      toast(`Abriendo ${path.split('\\').pop()}...`, 'info');
      const res = await fetch('/api/fs/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', path })
      });
      if (res.ok) {
        setTimeout(fetchHubData, 1000);
      } else {
        toast('No se pudo abrir el proyecto', 'error');
      }
    } catch {
      toast('Error al abrir el proyecto', 'error');
    }
  };

  const handleOpenLocation = async (path: string) => {
    try {
      const res = await fetch('/api/fs/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open-location', path })
      });
      if (!res.ok) {
        toast('No se pudo abrir la ubicación', 'error');
      }
    } catch {
      toast('Error al abrir la ubicación', 'error');
    }
  };

  const openCreateModal = async () => {
    setProjectName('');
    setProjectDir(BASE_DIR);
    setShowCreateModal(true);
    setLoadingSubfolders(true);
    try {
      const res = await fetch(`/api/fs?path=${encodeURIComponent(BASE_DIR)}`);
      if (res.ok) {
        const data = await res.json();
        const dirs = ((data.entries ?? []) as Array<{ name: string; isDir: boolean; path: string }>)
          .filter(e => e.isDir)
          .map(e => e.path)
          .sort();
        setMotionSubfolders(dirs);
      }
    } catch { /* si falla, simplemente no hay chips */ }
    finally { setLoadingSubfolders(false); }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/ae-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'create-project', 
          name: projectName.trim(), 
          directory: projectDir.trim() 
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast(`Proyecto ${projectName} creado y abriendo en After Effects`, 'success');
        setShowCreateModal(false);
        setProjectName('');
        fetchHubData();
      } else {
        toast(data.error || 'Error al crear proyecto', 'error');
      }
    } catch {
      toast('Error al comunicarse con el servidor', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setCreatingGroup(true);
    try {
      const res = await fetch('/api/ae-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-group', name: groupName.trim() })
      });
      if (res.ok) {
        toast(`Grupo "${groupName}" creado`, 'success');
        setShowCreateGroupModal(false);
        setGroupName('');
        fetchHubData();
      } else {
        toast('Error al crear grupo', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleRenameGroup = async (groupId: string) => {
    if (!renamingGroupName.trim()) return;
    try {
      const res = await fetch('/api/ae-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename-group', groupId, newName: renamingGroupName.trim() })
      });
      if (res.ok) {
        toast('Grupo renombrado', 'success');
        setRenamingGroupId(null);
        fetchHubData();
      } else {
        toast('Error al renombrar', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    }
  };

  const handleDeleteGroup = async (groupId: string, name: string) => {
    if (!confirm(`¿Estás seguro de eliminar el grupo "${name}"?\n(Esto NO borrará los archivos de tu disco)`)) return;
    try {
      const res = await fetch('/api/ae-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-group', groupId })
      });
      if (res.ok) {
        toast('Grupo eliminado', 'success');
        fetchHubData();
      } else {
        toast('Error al eliminar grupo', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    }
  };

  const handleRemoveRecent = async (filePath: string) => {
    try {
      const res = await fetch('/api/ae-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove-recent', filePath })
      });
      if (res.ok) {
        toast('Removido de recientes', 'info');
        fetchHubData();
      }
    } catch {
      toast('Error de red', 'error');
    }
  };

  const handleAddToGroup = async (groupId: string, filePath: string) => {
    try {
      const res = await fetch('/api/ae-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-to-group', groupId, filePath })
      });
      if (res.ok) {
        fetchHubData();
      } else {
        toast('Error al asociar al grupo', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    }
  };

  const handleRemoveFromGroup = async (groupId: string, filePath: string) => {
    try {
      const res = await fetch('/api/ae-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove-from-group', groupId, filePath })
      });
      if (res.ok) {
        toast('Proyecto removido del grupo', 'info');
        fetchHubData();
      }
    } catch {
      toast('Error de red', 'error');
    }
  };

  const handleMigrate = async (project: RecentProject) => {
    if (migratingPath) return;
    setMigratingPath(project.path);
    try {
      const res = await fetch('/api/ae-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'migrate-project', filePath: project.path })
      });
      const data = await res.json();
      if (res.ok) {
        const assetMsg = data.copiedAssets > 0 ? `, ${data.copiedAssets} asset(s) copiados` : '';
        toast(`✓ Proyecto migrado${assetMsg}. Carpeta: ${data.projectFolder}`, 'success');
        if (data.relinkScript) {
          const api = (window as any).electronAPI;
          api?.aeRunRelinkScript?.(data.relinkScript);
        }
        fetchHubData();
      } else {
        toast(data.error || 'Error al migrar', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    } finally {
      setMigratingPath(null);
    }
  };

  const handleOpenProjectFolder = (folderPath: string) => {
    const api = (window as any).electronAPI;
    if (api?.openProjectFolder) {
      api.openProjectFolder(folderPath);
    } else {
      fetch('/api/fs/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open-location', path: folderPath })
      });
    }
  };

  const handleSetColorLabel = async (filePath: string, labelId: string) => {
    try {
      const res = await fetch('/api/ae-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set-color-label', filePath, colorLabel: labelId })
      });
      if (res.ok) {
        setLabelPickerFor(null);
        fetchHubData();
      } else {
        toast('Error al guardar etiqueta', 'error');
      }
    } catch {
      toast('Error de red', 'error');
    }
  };

  // Drag and Drop
  const handleDragStart = (e: React.DragEvent, path: string) => {
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    setDragOverGroupId(groupId);
  };

  const handleDragLeave = () => {
    setDragOverGroupId(null);
  };

  const handleDrop = (e: React.DragEvent, groupId: string) => {
    e.preventDefault();
    setDragOverGroupId(null);
    const path = e.dataTransfer.getData('text/plain');
    if (path) handleAddToGroup(groupId, path);
  };

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const timeAgo = (dateStr: string) => {
    try {
      const seconds = Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / 1000);
      if (seconds < 60) return 'Hace un momento';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `Hace ${minutes} min`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `Hace ${hours} h`;
      const days = Math.floor(hours / 24);
      return `Hace ${days} días`;
    } catch {
      return 'Recientemente';
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
        <Loader className="spin-animation" size={32} color="var(--accent)" />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Cargando Hub...</span>
      </div>
    );
  }

  // ── Greeting ───────────────────────────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const greetingLine = recentProjects.length === 0
    ? `${greeting} — ¿arrancamos con un proyecto nuevo?`
    : `${greeting} — tenés ${recentProjects.length} proyecto${recentProjects.length !== 1 ? 's' : ''} activos`;

  const totalAssetsCount = recentProjects.reduce((acc, p) => acc + (p.dependencyCount || 0), 0);

  // ── Reusable label picker ─────────────────────────────────────────────────
  const renderLabelPicker = (project: RecentProject) =>
    labelPickerFor === project.path ? (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setLabelPickerFor(null)} />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          style={{
            position: 'fixed',
            top: labelPickerPos.above ? labelPickerPos.y - 274 : labelPickerPos.y,
            left: labelPickerPos.x,
            zIndex: 9999,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-float)',
            padding: '10px 12px',
            minWidth: 200,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 8 }}>ETIQUETA AE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {AE_LABELS.map(label => (
              <button key={label.id} onClick={() => handleSetColorLabel(project.path, label.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: project.colorLabel === label.id ? 'rgba(255,255,255,0.07)' : 'transparent', border: project.colorLabel === label.id ? `1px solid ${label.color}44` : '1px solid transparent', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'background 0.15s' }}
              >
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: label.color, flexShrink: 0, boxShadow: project.colorLabel === label.id ? `0 0 6px ${label.color}88` : 'none' }} />
                <span style={{ fontSize: 11.5, color: 'var(--text-primary)' }}>{label.name}</span>
                {project.colorLabel === label.id && <span style={{ marginLeft: 'auto', fontSize: 10, color: label.color }}>✓</span>}
              </button>
            ))}
          </div>
        </motion.div>
      </>
    ) : null;

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 0', display: 'flex', flexDirection: 'column', gap: 28, minHeight: '100%' }}>

      {/* ─── HERO ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        style={{
          background: 'linear-gradient(135deg, rgba(14,201,0,0.11) 0%, rgba(14,201,0,0.03) 55%, transparent 100%)',
          border: '1px solid rgba(14,201,0,0.16)',
          borderRadius: 16,
          padding: '30px 36px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Animated glow orb */}
        <motion.div
          animate={{ scale: [1, 1.14, 1], opacity: [0.10, 0.20, 0.10] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', top: '-40%', right: '-5%', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,201,0,0.18) 0%, transparent 70%)', pointerEvents: 'none' }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, opacity: 0.75 }}>
            MooMotion · After Effects Hub
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.2 }}>
            {greetingLine}
          </h1>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 24, fontFamily: 'monospace' }}>
            {BASE_DIR} &nbsp;·&nbsp; {groups.length} grupo{groups.length !== 1 ? 's' : ''} &nbsp;·&nbsp; {totalAssetsCount} assets
          </p>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { icon: <Plus size={15} strokeWidth={2.5} />, label: 'Nuevo Proyecto', sub: 'Estructura AE completa', accent: true,  onClick: () => openCreateModal() },
              { icon: <FolderOpen size={15} />,             label: 'Explorar Disco',  sub: BASE_DIR,               accent: false, onClick: () => navigate(BASE_DIR) },
              { icon: <ExternalLink size={15} />,           label: 'Escanear Assets', sub: 'Deps sin vincular',      accent: false, onClick: () => toast('Función próximamente', 'info') },
              { icon: <FolderPlus size={15} />,             label: 'Nuevo Grupo',     sub: 'Organizar proyectos',    accent: false, onClick: () => setShowCreateGroupModal(true) },
            ].map((action, i) => (
              <motion.button
                key={i}
                whileHover={{ y: -2, boxShadow: action.accent ? '0 8px 24px rgba(14,201,0,0.28)' : '0 6px 18px rgba(0,0,0,0.28)' }}
                whileTap={{ scale: 0.97 }}
                onClick={action.onClick}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '9px 16px', borderRadius: 9,
                  background: action.accent ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                  border: action.accent ? 'none' : '1px solid rgba(255,255,255,0.09)',
                  color: action.accent ? '#000' : 'var(--text-primary)',
                  cursor: 'pointer', fontWeight: 600, fontSize: 12.5,
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ color: action.accent ? '#000' : 'var(--accent)', flexShrink: 0 }}>{action.icon}</span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                  <span>{action.label}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 400, opacity: 0.55, fontFamily: action.sub.includes(':\\') ? 'monospace' : 'inherit' }}>{action.sub}</span>
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ─── MAIN 2-COL LAYOUT ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 272px', gap: 22, alignItems: 'start' }}>

        {/* LEFT: Recent Projects — 2-column cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Proyectos Recientes</h2>
            {recentProjects.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{recentProjects.length} proyectos</span>}
          </div>

          {recentProjects.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 12, padding: '56px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
            >
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(14,201,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clapperboard size={24} color="var(--accent)" strokeWidth={1.5} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Sin proyectos aún</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Creá tu primer proyecto o abrí uno desde After Effects</div>
              </div>
              <button className="btn btn-primary glow-card" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => openCreateModal()}>
                <Plus size={14} /> Crear Proyecto
              </button>
            </motion.div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <AnimatePresence>
                {recentProjects.map((project, idx) => {
                  const labelColor = getLabelColor(project.colorLabel);
                  return (
                    <motion.div
                      key={project.path}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: idx * 0.035, duration: 0.22 }}
                      draggable
                      onDragStart={(e: any) => handleDragStart(e, project.path)}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.borderColor = labelColor + '55';
                        el.style.boxShadow = `0 4px 20px ${labelColor}14`;
                        el.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.borderColor = 'rgba(255,255,255,0.06)';
                        el.style.boxShadow = 'none';
                        el.style.transform = 'none';
                      }}
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 12,
                        padding: '14px',
                        display: 'flex', flexDirection: 'column', gap: 10,
                        cursor: 'grab',
                        transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
                        position: 'relative', overflow: 'visible',
                      }}
                    >
                      {/* Color top bar */}
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: labelColor, borderRadius: '12px 12px 0 0', opacity: project.colorLabel && project.colorLabel !== 'none' ? 1 : 0.12 }} />

                      {renderLabelPicker(project)}

                      {/* Icon + name */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 5 }}>
                        <div
                          style={{ flexShrink: 0, cursor: 'pointer', lineHeight: 0 }}
                          onClick={e => {
                            e.stopPropagation();
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setLabelPickerPos({ x: rect.left, y: rect.bottom + 6, above: rect.bottom + 274 > window.innerHeight });
                            setLabelPickerFor(labelPickerFor === project.path ? null : project.path);
                          }}
                          title="Click para cambiar etiqueta"
                        >
                          <AepIcon color={labelColor} size={30} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            onClick={() => handleOpenProject(project.path)}
                            style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', marginBottom: 2 }}
                            className="hover-accent"
                          >
                            {project.name}
                          </div>
                          <div
                            onClick={() => handleOpenLocation(project.path)}
                            style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', fontFamily: 'monospace' }}
                            className="hover-underline"
                            title={project.path}
                          >
                            {project.path.replace(/^[A-Z]:\\Motion\\/, '').replace(/\\[^\\]+\.aep$/, '')}
                          </div>
                        </div>
                        {!project.exists && <span title="Archivo no encontrado" style={{ flexShrink: 0 }}><AlertCircle size={13} color="var(--danger)" style={{ marginTop: 2 }} /></span>}
                      </div>

                      {/* Meta + actions */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: 8, fontSize: 10.5, color: 'var(--text-muted)' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="Peso"><HardDrive size={10} /> {formatBytes(project.size)}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="Última apertura"><Calendar size={10} /> {timeAgo(project.lastOpened)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 3 }}>
                          <button className="btn btn-ghost btn-icon" style={{ width: 22, height: 22 }} onClick={() => handleOpenProject(project.path)} title="Abrir en AE">
                            <Play size={10} color="var(--accent)" fill="var(--accent)" />
                          </button>
                          {project.projectFolder ? (
                            <button className="btn btn-ghost btn-icon" style={{ width: 22, height: 22 }} onClick={() => handleOpenProjectFolder(project.projectFolder!)} title="Abrir carpeta">
                              <FolderOpen size={10} color="var(--blue)" />
                            </button>
                          ) : (
                            <button className="btn btn-ghost btn-icon" style={{ width: 22, height: 22, opacity: migratingPath === project.path ? 0.5 : 1 }} onClick={() => handleMigrate(project)} title="Crear carpeta de proyecto" disabled={!!migratingPath}>
                              {migratingPath === project.path ? <Loader size={10} className="spin-animation" /> : <FolderPlus size={10} color="#e8c540" />}
                            </button>
                          )}
                          <div style={{ position: 'relative' }} className="group-selector-parent">
                            <button className="btn btn-ghost btn-icon" style={{ width: 22, height: 22 }} title="Asignar a grupo"><Folder size={10} /></button>
                            <div className="group-selector-dropdown" style={{ position: 'absolute', right: 0, top: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-float)', padding: 4, zIndex: 100, display: 'none', minWidth: 150 }}>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 8px', fontWeight: 600 }}>ASIGNAR A:</div>
                              {groups.map(g => (
                                <button key={g.id} className="dropdown-item" style={{ width: '100%', textAlign: 'left', padding: '6px 8px', fontSize: 11.5, background: 'transparent', border: 'none', color: 'var(--text-primary)', borderRadius: 4, cursor: 'pointer', display: 'flex', gap: 6 }} onClick={() => handleAddToGroup(g.id, project.path)}>
                                  <Folder size={11} color="var(--accent)" /> {g.name}
                                </button>
                              ))}
                              {groups.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 8px' }}>Crea un grupo primero</div>}
                            </div>
                          </div>
                          <button className="btn btn-ghost btn-icon hover-danger" style={{ width: 22, height: 22 }} onClick={() => handleRemoveRecent(project.path)} title="Quitar de recientes">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* RIGHT: To-do + Groups */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* TO-DO WIDGET */}
          <TodoWidget />

          {/* GRUPOS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Grupos</h2>
              <button className="btn btn-ghost btn-icon" style={{ width: 22, height: 22, borderRadius: '50%' }} onClick={() => setShowCreateGroupModal(true)} title="Nuevo grupo"><Plus size={13} /></button>
            </div>

            {groups.length === 0 ? (
              <div style={{ border: '1px dashed rgba(255,255,255,0.06)', borderRadius: 8, padding: '18px 12px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                <div style={{ marginBottom: 6 }}>Sin grupos aún</div>
                <button className="btn btn-ghost" style={{ fontSize: 10.5, color: 'var(--accent)' }} onClick={() => setShowCreateGroupModal(true)}>+ Crear grupo</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {groups.map(group => {
                  const isCollapsed = collapsedGroups[group.id] ?? false;
                  const isOver = dragOverGroupId === group.id;
                  const folderPapers = group.projectPaths.slice(0, 3).map(p => (
                    <div key={p} onClick={e => { e.stopPropagation(); handleOpenProject(p); }} style={{ fontSize: '7px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2px', textAlign: 'center', width: '100%', height: '100%', lineHeight: 1.1, cursor: 'pointer' }} title={p.split('\\').pop()}>
                      <Clapperboard size={10} color="var(--accent)" style={{ marginBottom: 1 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', whiteSpace: 'nowrap' }}>{(p.split('\\').pop() || '').replace('.aep', '').substring(0, 6)}</span>
                    </div>
                  ));

                  return (
                    <div key={group.id}
                      onDragOver={e => handleDragOver(e, group.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={e => handleDrop(e, group.id)}
                      style={{ background: isOver ? 'rgba(14,201,0,0.05)' : 'var(--bg-surface)', border: isOver ? '1px dashed var(--accent)' : '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 10, transition: 'all 0.2s' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flexShrink: 0, width: 50, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FolderComponent color="#0EC900" size={0.5} items={folderPapers} isOpen={!isCollapsed} onToggle={() => toggleGroupCollapse(group.id)} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            {renamingGroupId === group.id ? (
                              <input type="text" value={renamingGroupName} onChange={e => setRenamingGroupName(e.target.value)} onBlur={() => handleRenameGroup(group.id)} onKeyDown={e => e.key === 'Enter' && handleRenameGroup(group.id)} autoFocus style={{ background: 'var(--bg-elevated)', border: '1px solid var(--accent)', color: 'var(--text-primary)', fontSize: 11.5, padding: '2px 6px', borderRadius: 4, width: '80%' }} onClick={e => e.stopPropagation()} />
                            ) : (
                              <span onClick={() => toggleGroupCollapse(group.id)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>{group.name}</span>
                            )}
                            <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                              <button className="btn btn-ghost btn-icon" style={{ width: 17, height: 17 }} onClick={e => { e.stopPropagation(); setRenamingGroupId(group.id); setRenamingGroupName(group.name); }} title="Renombrar"><Edit2 size={9} /></button>
                              <button className="btn btn-ghost btn-icon hover-danger" style={{ width: 17, height: 17 }} onClick={e => { e.stopPropagation(); handleDeleteGroup(group.id, group.name); }} title="Eliminar"><Trash2 size={9} /></button>
                            </div>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{group.projectPaths.length} proyecto{group.projectPaths.length !== 1 ? 's' : ''}</div>
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {group.projectPaths.length === 0 && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0', border: '1px dashed rgba(255,255,255,0.04)', borderRadius: 4 }}>Arrastrá proyectos aquí</div>
                          )}
                          {group.projectPaths.map(p => (
                            <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 4, padding: '4px 7px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={() => handleOpenProject(p)}>
                                <Clapperboard size={10} color="var(--accent)" style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: 10.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="hover-accent">{p.split('\\').pop()}</span>
                              </div>
                              <button className="btn btn-ghost btn-icon hover-danger" style={{ width: 16, height: 16 }} onClick={() => handleRemoveFromGroup(group.id, p)} title="Quitar"><X size={8} /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── MODAL: CREAR PROYECTO ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreateModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              style={{ width: 460, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px 28px', boxShadow: 'var(--shadow-float)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clapperboard color="var(--accent)" size={18} /> Nuevo Proyecto After Effects
                </h3>
                <button className="btn btn-ghost btn-icon" onClick={() => setShowCreateModal(false)}><X size={16} /></button>
              </div>
              <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500 }}>Nombre del Proyecto</label>
                  <input type="text" placeholder="ej. End Game Promo" value={projectName} onChange={e => setProjectName(e.target.value)} required autoFocus
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500 }}>Directorio de Trabajo</label>
                  {loadingSubfolders ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>Cargando carpetas...</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button type="button" onClick={() => setProjectDir(BASE_DIR)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontFamily: 'monospace', border: `1px solid ${projectDir === BASE_DIR ? 'var(--accent)' : 'var(--border)'}`, background: projectDir === BASE_DIR ? 'rgba(14,201,0,0.12)' : 'var(--bg-elevated)', color: projectDir === BASE_DIR ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s' }}>
                        {BASE_DIR.split('\\').pop() || BASE_DIR}
                      </button>
                      {motionSubfolders.map(sub => (
                        <button key={sub} type="button" onClick={() => setProjectDir(sub)} style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontFamily: 'monospace', border: `1px solid ${projectDir === sub ? 'var(--accent)' : 'var(--border)'}`, background: projectDir === sub ? 'rgba(14,201,0,0.12)' : 'var(--bg-elevated)', color: projectDir === sub ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s' }}>
                          {sub.replace(BASE_DIR + '\\', '')}
                        </button>
                      ))}
                    </div>
                  )}
                  <input type="text" value={projectDir} onChange={e => setProjectDir(e.target.value)} required
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
                  {projectName.trim() && (
                    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: 9.5, marginBottom: 6, letterSpacing: '0.06em' }}>ESTRUCTURA A CREAR:</div>
                      <div style={{ color: 'var(--accent)' }}>📁 {projectDir.trim() || BASE_DIR}\</div>
                      <div style={{ paddingLeft: 14, color: 'var(--text-primary)' }}>📁 <strong>{projectName.trim()}\</strong></div>
                      <div style={{ paddingLeft: 28, color: 'var(--blue)' }}>🎬 {projectName.trim()}.aep</div>
                      <div style={{ paddingLeft: 28, color: 'var(--text-secondary)' }}>📁 Assets\ → Images\ Video\ Audio\ Vector\</div>
                      <div style={{ paddingLeft: 28, color: 'var(--text-secondary)' }}>📁 Renders\</div>
                      <div style={{ paddingLeft: 28, color: 'var(--text-secondary)' }}>📁 Exports\</div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button type="button" className="btn btn-default" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary glow-card" disabled={creating} style={{ minWidth: 130 }}>
                    {creating ? <Loader className="spin-animation" size={14} /> : 'Crear Proyecto'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── MODAL: CREAR GRUPO ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreateGroupModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              style={{ width: 400, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px 28px', boxShadow: 'var(--shadow-float)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FolderPlus color="var(--accent)" size={18} /> Crear Nuevo Grupo
                </h3>
                <button className="btn btn-ghost btn-icon" onClick={() => setShowCreateGroupModal(false)}><X size={16} /></button>
              </div>
              <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500 }}>Nombre del Grupo</label>
                  <input type="text" placeholder="ej. End Game" value={groupName} onChange={e => setGroupName(e.target.value)} required autoFocus
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Organiza proyectos lógicamente sin moverlos en el disco.</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button type="button" className="btn btn-default" onClick={() => setShowCreateGroupModal(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={creatingGroup}>
                    {creatingGroup ? <Loader className="spin-animation" size={14} /> : 'Crear Grupo'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

// ── TO-DO WIDGET (localStorage) ───────────────────────────────────────────────
interface TodoItem { id: string; text: string; done: boolean; }

function TodoWidget() {
  const [items, setItems] = useState<TodoItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('hub-todo') || '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');

  useEffect(() => {
    localStorage.setItem('hub-todo', JSON.stringify(items));
  }, [items]);

  const add = () => {
    const t = input.trim();
    if (!t) return;
    setItems(prev => [...prev, { id: Date.now().toString(), text: t, done: false }]);
    setInput('');
  };

  const toggle = (id: string) => setItems(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const remove = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const clearDone = () => setItems(prev => prev.filter(i => !i.done));

  const doneCount = items.filter(i => i.done).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.12, duration: 0.3 }}
      style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 15 }}>✅</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Hoy</span>
          {items.length > 0 && (
            <span style={{ fontSize: 10, background: 'rgba(14,201,0,0.14)', color: 'var(--accent)', padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>
              {doneCount}/{items.length}
            </span>
          )}
        </div>
        {doneCount > 0 && (
          <button onClick={clearDone}
            style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            Limpiar hechos
          </button>
        )}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Agregar tarea del día..."
          style={{ flex: 1, background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 11.5, outline: 'none' }}
        />
        <button onClick={add}
          style={{ padding: '5px 10px', borderRadius: 7, background: 'rgba(14,201,0,0.14)', border: '1px solid rgba(14,201,0,0.22)', color: 'var(--accent)', cursor: 'pointer', fontSize: 16, lineHeight: 1, fontWeight: 700 }}
        >+</button>
      </div>

      {/* Tasks */}
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>Sin tareas por ahora 🎬</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 190, overflowY: 'auto' }}>
          <AnimatePresence>
            {items.map(item => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 5px', borderRadius: 6, background: item.done ? 'rgba(255,255,255,0.012)' : 'transparent' }}
              >
                {/* Checkbox */}
                <button onClick={() => toggle(item.id)} style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: item.done ? 'none' : '1.5px solid rgba(255,255,255,0.2)', background: item.done ? 'var(--accent)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                  {item.done && <span style={{ fontSize: 9, color: '#000', fontWeight: 900 }}>✓</span>}
                </button>
                <span style={{ flex: 1, fontSize: 11.5, color: item.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: item.done ? 'line-through' : 'none', transition: 'all 0.2s' }}>
                  {item.text}
                </span>
                <button onClick={() => remove(item.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.12)', fontSize: 14, lineHeight: 1, padding: '0 2px', borderRadius: 3, transition: 'color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.12)')}
                >×</button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
