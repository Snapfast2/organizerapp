'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { 
  FileIcon, Video, Image as ImageIcon, Music, FileText, FileArchive, 
  Clapperboard, FolderOpen, Monitor, CheckCircle2, X
} from 'lucide-react';

// ── File type → icon component ──────────────────────────────────
function getFileIcon(ext: string) {
  const video = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
  const image = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
  const audio = ['mp3', 'wav', 'ogg', 'flac', 'aac'];
  const doc   = ['pdf', 'doc', 'docx', 'txt', 'xlsx'];
  const zip   = ['zip', 'rar', '7z', 'tar', 'gz'];
  const ae    = ['aep', 'aet'];
  
  if (ae.includes(ext))    return Clapperboard;
  if (video.includes(ext)) return Video;
  if (image.includes(ext)) return ImageIcon;
  if (audio.includes(ext)) return Music;
  if (doc.includes(ext))   return FileText;
  if (zip.includes(ext))   return FileArchive;
  return FileIcon;
}

// ── Destination button icon component ───────────────────────────
function getDestIcon(label: string) {
  const l = label.toLowerCase();
  if (l.includes('escritorio')) return Monitor;
  if (l.includes('video'))      return Video;
  if (l.includes('imagen'))     return ImageIcon;
  if (l.includes('document'))   return FileText;
  if (l.includes('música'))     return Music;
  if (l.includes('proyecto'))   return Clapperboard;
  return FolderOpen;
}

interface Destination { label: string; path: string; }

function PopupContent() {
  const params = useSearchParams();
  const filePath = params.get('filePath') ?? '';
  const fileName = params.get('fileName') ?? 'archivo';
  const fileSize = params.get('fileSize') ?? '';
  const ext      = params.get('ext') ?? '';
  const dests: Destination[] = JSON.parse(params.get('dests') ?? '[]');

  const [visible, setVisible] = useState(false);
  const [moving, setMoving] = useState(false);
  const [done, setDone] = useState(false);
  const [movedTo, setMovedTo] = useState('');

  useEffect(() => {
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    setTimeout(() => setVisible(true), 50);
  }, []);

  const handleMove = (dest: Destination) => {
    if (moving) return;
    setMoving(true);
    const api = (window as any).electronAPI;
    if (api) {
      api.popupMove(filePath, dest.path);
    }
    setMovedTo(dest.label);
    setDone(true);
    setTimeout(() => api?.popupIgnore(), 1200);
  };

  const handleIgnore = () => {
    const api = (window as any).electronAPI;
    api?.popupIgnore();
  };

  const MainIcon = done ? CheckCircle2 : getFileIcon(ext);

  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 0, margin: 0, boxSizing: 'border-box',
    }}>
      <div style={{
        width: '100%', height: '100%',
        background: '#0a0a0a',
        borderRadius: 12,
        border: '1px solid rgba(74, 222, 128, 0.2)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
        padding: '18px 20px 16px',
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: '#fff',
        transform: visible ? 'scale(1)' : 'scale(0.95)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}>
        {/* Accent glow top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #4ade80, transparent)',
          opacity: 0.8
        }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: 'rgba(74, 222, 128, 0.1)',
            border: '1px solid rgba(74, 222, 128, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <MainIcon size={22} color="var(--accent)" strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>
              {done ? 'Movido correctamente' : 'Nuevo archivo descargado'}
            </div>
            <div style={{
              fontSize: 14, fontWeight: 500, color: '#fff',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              lineHeight: 1.3,
            }}>
              {fileName}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {done ? `→ ${movedTo}` : fileSize}
            </div>
          </div>
          {!done && (
            <button onClick={handleIgnore} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s, background 0.15s', borderRadius: 6,
            }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Destinations */}
        {!done && (
          <>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
              ¿A dónde va?
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {dests.map((dest) => {
                const DestIcon = getDestIcon(dest.label);
                return (
                  <button
                    key={dest.path}
                    onClick={() => handleMove(dest)}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      color: '#fff',
                      fontSize: 12.5,
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'all 0.15s ease',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(74,222,128,0.08)';
                      e.currentTarget.style.borderColor = 'rgba(74,222,128,0.3)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                    }}
                  >
                    <DestIcon size={16} color="var(--accent)" strokeWidth={2} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dest.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PopupPage() {
  return (
    <Suspense>
      <PopupContent />
    </Suspense>
  );
}
