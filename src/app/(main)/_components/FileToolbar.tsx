'use client';
import {
  ArrowUp, RefreshCw, FolderPlus, Copy, Sparkles, Grid, List,
  SortAsc, SortDesc,
} from 'lucide-react';

// ─── FileToolbar ──────────────────────────────────────────────────────────────
// The path-input row + action/sort/view toolbar shown above the file grid.

export type SortField = 'name' | 'type' | 'size' | 'created' | 'modified';

interface FileToolbarProps {
  currentPath: string;
  pathInput: string;
  isLoading: boolean;
  viewMode: 'grid' | 'list';
  sortBy: string;
  sortDesc: boolean;
  showDuplicates: boolean;
  selectedCount: number;
  onPathInputChange: (value: string) => void;
  onNavigate: (path: string) => void;
  onGoUp: () => void;
  onRefresh: () => void;
  onSort: (field: SortField) => void;
  onSetViewMode: (mode: 'grid' | 'list') => void;
  onNewFolder: () => void;
  onShowDuplicates: () => void;
  onAITag: () => void;
}

const SORT_LABELS: Record<string, string> = {
  name: 'Nombre', type: 'Tipo', size: 'Tamaño', created: 'Creación', modified: 'Modificado',
};
const SORT_FIELDS: SortField[] = ['name', 'type', 'size', 'created', 'modified'];

export default function FileToolbar({
  currentPath, pathInput, isLoading, viewMode, sortBy, sortDesc,
  showDuplicates, selectedCount,
  onPathInputChange, onNavigate, onGoUp, onRefresh,
  onSort, onSetViewMode, onNewFolder, onShowDuplicates, onAITag,
}: FileToolbarProps) {
  return (
    <>
      {/* Path input row */}
      <div className="path-input-row">
        <button
          className="btn btn-ghost btn-icon"
          onClick={onGoUp}
          disabled={!currentPath || currentPath.length <= 3}
        >
          <ArrowUp size={16} />
        </button>
        <button className="btn btn-ghost btn-icon" onClick={onRefresh}>
          <RefreshCw size={14} className={isLoading ? 'spinning' : ''} />
        </button>
        <input
          className="path-input"
          value={pathInput}
          onChange={e => onPathInputChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onNavigate(pathInput)}
        />
      </div>

      {/* Action / sort / view toolbar */}
      {!showDuplicates && (
        <div className="toolbar">
          <div className="toolbar-group">
            <button className="btn btn-default" onClick={onNewFolder}>
              <FolderPlus size={14} /> Nueva Carpeta
            </button>
            <button className="btn btn-ghost" onClick={onShowDuplicates} title="Buscar Duplicados">
              <Copy size={16} /> Duplicados
            </button>
            <button
              className="btn btn-ghost"
              onClick={onAITag}
              title="Etiquetar con IA"
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Sparkles size={14} /> IA {selectedCount > 0 ? `(${selectedCount})` : ''}
            </button>
          </div>

          <div className="toolbar-divider" />

          {/* Sort controls */}
          <div className="toolbar-group">
            <span style={{ fontSize: 11, color: 'var(--text-muted)', userSelect: 'none' }}>
              Ordenar:
            </span>
            {SORT_FIELDS.map(field => {
              const active = sortBy === field;
              return (
                <button
                  key={field}
                  className={`btn btn-ghost sort-btn ${active ? 'active' : ''}`}
                  onClick={() => onSort(field)}
                  title={`Ordenar por ${SORT_LABELS[field]}`}
                >
                  {SORT_LABELS[field]}
                  {active ? (sortDesc ? <SortDesc size={12} /> : <SortAsc size={12} />) : null}
                </button>
              );
            })}
          </div>

          <div className="toolbar-divider" />

          {/* View mode toggle */}
          <div className="toolbar-group">
            <button
              className={`btn btn-ghost btn-icon ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => onSetViewMode('grid')}
            >
              <Grid size={16} />
            </button>
            <button
              className={`btn btn-ghost btn-icon ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => onSetViewMode('list')}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
