export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: string;
  created: string;
  ext: string;
  color?: string;
  tags?: string[];
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: FileEntry[];
  error?: string;
}

export interface ActionRequest {
  action: 'rename' | 'delete' | 'mkdir' | 'move' | 'copy' | 'open' | 'open-location' | 'open-trash' | 'undo';
  path: string;
  newPath?: string;
  newName?: string;
  undoAction?: any;
}

export interface BulkActionRequest {
  action: 'delete' | 'move' | 'copy' | 'group' | 'zip' | 'unzip' | 'rename';
  paths: string[];
  destPath?: string;
  newName?: string;
}

export interface SearchResult {
  entries: FileEntry[];
  query: string;
  searchPath: string;
}

export interface DiskStats {
  path: string;
  totalSize: number;
  fileCount: number;
  dirCount: number;
  topFiles: FileEntry[];
  byType: Record<string, { count: number; size: number }>;
}

export interface OrganizePreview {
  moves: Array<{ from: string; to: string; name: string }>;
  sourcePath: string;
}
