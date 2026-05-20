export type FileCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'code'
  | 'executable'
  | 'font'
  | 'folder'
  | 'other';

export interface FileTypeInfo {
  category: FileCategory;
  color: string;
  bgColor: string;
  label: string;
}

const EXT_MAP: Record<string, FileTypeInfo> = {
  // Images
  jpg: { category: 'image', color: '#a78bfa', bgColor: '#4c1d95', label: 'Imagen' },
  jpeg: { category: 'image', color: '#a78bfa', bgColor: '#4c1d95', label: 'Imagen' },
  png: { category: 'image', color: '#a78bfa', bgColor: '#4c1d95', label: 'Imagen' },
  gif: { category: 'image', color: '#a78bfa', bgColor: '#4c1d95', label: 'GIF' },
  svg: { category: 'image', color: '#c4b5fd', bgColor: '#4c1d95', label: 'SVG' },
  webp: { category: 'image', color: '#a78bfa', bgColor: '#4c1d95', label: 'Imagen' },
  bmp: { category: 'image', color: '#a78bfa', bgColor: '#4c1d95', label: 'Imagen' },
  ico: { category: 'image', color: '#a78bfa', bgColor: '#4c1d95', label: 'Icono' },
  tiff: { category: 'image', color: '#a78bfa', bgColor: '#4c1d95', label: 'Imagen' },
  tif: { category: 'image', color: '#a78bfa', bgColor: '#4c1d95', label: 'Imagen' },
  raw: { category: 'image', color: '#a78bfa', bgColor: '#4c1d95', label: 'RAW' },
  heic: { category: 'image', color: '#a78bfa', bgColor: '#4c1d95', label: 'Imagen' },

  // Videos
  mp4: { category: 'video', color: '#f472b6', bgColor: '#831843', label: 'Video' },
  avi: { category: 'video', color: '#f472b6', bgColor: '#831843', label: 'Video' },
  mkv: { category: 'video', color: '#f472b6', bgColor: '#831843', label: 'Video' },
  mov: { category: 'video', color: '#f472b6', bgColor: '#831843', label: 'Video' },
  wmv: { category: 'video', color: '#f472b6', bgColor: '#831843', label: 'Video' },
  flv: { category: 'video', color: '#f472b6', bgColor: '#831843', label: 'Video' },
  webm: { category: 'video', color: '#f472b6', bgColor: '#831843', label: 'Video' },
  m4v: { category: 'video', color: '#f472b6', bgColor: '#831843', label: 'Video' },

  // Audio
  mp3: { category: 'audio', color: '#34d399', bgColor: '#064e3b', label: 'Audio' },
  wav: { category: 'audio', color: '#34d399', bgColor: '#064e3b', label: 'Audio' },
  flac: { category: 'audio', color: '#34d399', bgColor: '#064e3b', label: 'Audio' },
  aac: { category: 'audio', color: '#34d399', bgColor: '#064e3b', label: 'Audio' },
  ogg: { category: 'audio', color: '#34d399', bgColor: '#064e3b', label: 'Audio' },
  m4a: { category: 'audio', color: '#34d399', bgColor: '#064e3b', label: 'Audio' },
  wma: { category: 'audio', color: '#34d399', bgColor: '#064e3b', label: 'Audio' },

  // Documents
  pdf: { category: 'document', color: '#fb923c', bgColor: '#7c2d12', label: 'PDF' },
  doc: { category: 'document', color: '#60a5fa', bgColor: '#1e3a5f', label: 'Word' },
  docx: { category: 'document', color: '#60a5fa', bgColor: '#1e3a5f', label: 'Word' },
  txt: { category: 'document', color: '#94a3b8', bgColor: '#1e293b', label: 'Texto' },
  md: { category: 'document', color: '#94a3b8', bgColor: '#1e293b', label: 'Markdown' },
  rtf: { category: 'document', color: '#60a5fa', bgColor: '#1e3a5f', label: 'RTF' },
  odt: { category: 'document', color: '#60a5fa', bgColor: '#1e3a5f', label: 'Documento' },

  // Spreadsheets
  xls: { category: 'spreadsheet', color: '#4ade80', bgColor: '#14532d', label: 'Excel' },
  xlsx: { category: 'spreadsheet', color: '#4ade80', bgColor: '#14532d', label: 'Excel' },
  csv: { category: 'spreadsheet', color: '#4ade80', bgColor: '#14532d', label: 'CSV' },
  ods: { category: 'spreadsheet', color: '#4ade80', bgColor: '#14532d', label: 'Hoja' },

  // Presentations
  ppt: { category: 'presentation', color: '#fb923c', bgColor: '#431407', label: 'PowerPoint' },
  pptx: { category: 'presentation', color: '#fb923c', bgColor: '#431407', label: 'PowerPoint' },
  odp: { category: 'presentation', color: '#fb923c', bgColor: '#431407', label: 'Presentación' },

  // Archives
  zip: { category: 'archive', color: '#fbbf24', bgColor: '#451a03', label: 'ZIP' },
  rar: { category: 'archive', color: '#fbbf24', bgColor: '#451a03', label: 'RAR' },
  '7z': { category: 'archive', color: '#fbbf24', bgColor: '#451a03', label: '7-Zip' },
  tar: { category: 'archive', color: '#fbbf24', bgColor: '#451a03', label: 'TAR' },
  gz: { category: 'archive', color: '#fbbf24', bgColor: '#451a03', label: 'GZIP' },

  // Code
  js: { category: 'code', color: '#fde047', bgColor: '#3f3100', label: 'JavaScript' },
  ts: { category: 'code', color: '#60a5fa', bgColor: '#1e3a8a', label: 'TypeScript' },
  tsx: { category: 'code', color: '#60a5fa', bgColor: '#1e3a8a', label: 'TSX' },
  jsx: { category: 'code', color: '#fde047', bgColor: '#3f3100', label: 'JSX' },
  html: { category: 'code', color: '#fb923c', bgColor: '#431407', label: 'HTML' },
  css: { category: 'code', color: '#a78bfa', bgColor: '#4c1d95', label: 'CSS' },
  py: { category: 'code', color: '#4ade80', bgColor: '#14532d', label: 'Python' },
  java: { category: 'code', color: '#fb923c', bgColor: '#431407', label: 'Java' },
  cs: { category: 'code', color: '#a78bfa', bgColor: '#4c1d95', label: 'C#' },
  cpp: { category: 'code', color: '#60a5fa', bgColor: '#1e3a8a', label: 'C++' },
  c: { category: 'code', color: '#60a5fa', bgColor: '#1e3a8a', label: 'C' },
  go: { category: 'code', color: '#34d399', bgColor: '#064e3b', label: 'Go' },
  rs: { category: 'code', color: '#fb923c', bgColor: '#431407', label: 'Rust' },
  php: { category: 'code', color: '#a78bfa', bgColor: '#4c1d95', label: 'PHP' },
  json: { category: 'code', color: '#fbbf24', bgColor: '#451a03', label: 'JSON' },
  xml: { category: 'code', color: '#94a3b8', bgColor: '#1e293b', label: 'XML' },
  yaml: { category: 'code', color: '#34d399', bgColor: '#064e3b', label: 'YAML' },
  yml: { category: 'code', color: '#34d399', bgColor: '#064e3b', label: 'YAML' },
  sql: { category: 'code', color: '#60a5fa', bgColor: '#1e3a8a', label: 'SQL' },
  sh: { category: 'code', color: '#34d399', bgColor: '#064e3b', label: 'Shell' },
  bat: { category: 'code', color: '#94a3b8', bgColor: '#1e293b', label: 'Batch' },
  ps1: { category: 'code', color: '#60a5fa', bgColor: '#1e3a8a', label: 'PowerShell' },

  // Executables
  exe: { category: 'executable', color: '#f87171', bgColor: '#450a0a', label: 'Programa' },
  msi: { category: 'executable', color: '#f87171', bgColor: '#450a0a', label: 'Instalador' },
  dll: { category: 'executable', color: '#94a3b8', bgColor: '#1e293b', label: 'DLL' },

  // Fonts
  ttf: { category: 'font', color: '#c4b5fd', bgColor: '#3b0764', label: 'Fuente' },
  otf: { category: 'font', color: '#c4b5fd', bgColor: '#3b0764', label: 'Fuente' },
  woff: { category: 'font', color: '#c4b5fd', bgColor: '#3b0764', label: 'Fuente' },
  woff2: { category: 'font', color: '#c4b5fd', bgColor: '#3b0764', label: 'Fuente' },
};

export function getFileTypeInfo(ext: string): FileTypeInfo {
  return (
    EXT_MAP[ext.toLowerCase()] || {
      category: 'other',
      color: '#64748b',
      bgColor: '#0f172a',
      label: ext.toUpperCase() || 'Archivo',
    }
  );
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export const ORGANIZE_RULES: Record<string, string[]> = {
  'Imágenes': ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff', 'tif', 'raw', 'heic'],
  'Videos': ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v'],
  'Audio': ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'],
  'Documentos': ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt'],
  'Hojas de Cálculo': ['xls', 'xlsx', 'csv', 'ods'],
  'Presentaciones': ['ppt', 'pptx', 'odp'],
  'Archivos Comprimidos': ['zip', 'rar', '7z', 'tar', 'gz'],
  'Código': ['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'py', 'java', 'cs', 'cpp', 'c', 'go', 'rs', 'php', 'json', 'xml', 'yaml', 'yml', 'sql', 'sh', 'bat', 'ps1'],
  'Programas': ['exe', 'msi', 'dll'],
  'Fuentes': ['ttf', 'otf', 'woff', 'woff2'],
};
