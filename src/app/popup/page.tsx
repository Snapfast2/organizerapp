'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

// ── File type → emoji ──────────────────────────────────────────
function fileIcon(ext: string): string {
  const video = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
  const image = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
  const audio = ['mp3', 'wav', 'ogg', 'flac', 'aac'];
  const doc   = ['pdf', 'doc', 'docx', 'txt', 'xlsx'];
  const zip   = ['zip', 'rar', '7z', 'tar', 'gz'];
  const ae    = ['aep', 'aet'];
  if (ae.includes(ext))    return '🎬';
  if (video.includes(ext)) return '🎥';
  if (image.includes(ext)) return '🖼️';
  if (audio.includes(ext)) return '🎵';
  if (doc.includes(ext))   return '📄';
  if (zip.includes(ext))   return '📦';
  return '📁';
}

// ── Destination button icon ────────────────────────────────────
function destIcon(label: string): string {
  if (label.toLowerCase().includes('escritorio')) return '🖥️';
  if (label.toLowerCase().includes('video'))      return '🎥';
  if (label.toLowerCase().includes('imagen'))     return '🖼️';
  if (label.toLowerCase().includes('document'))   return '📄';
  if (label.toLowerCase().includes('música'))     return '🎵';
  if (label.toLowerCase().includes('proyecto'))   return '🎬';
  return '📂';
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
    // Slide-in animation
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

  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      padding: 0, margin: 0, boxSizing: 'border-box',
    }}>
      <div style={{
        width: 390,
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        borderRadius: 16,
        border: '1px solid rgba(74, 222, 128, 0.25)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.08)',
        padding: '18px 20px 16px',
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: '#fff',
        transform: visible ? 'translateX(0) translateY(0)' : 'translateX(30px) translateY(10px)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Accent glow */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, #4ade80, transparent)',
          borderRadius: '16px 16px 0 0',
        }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10,
            background: 'rgba(74, 222, 128, 0.12)',
            border: '1px solid rgba(74, 222, 128, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>
            {done ? '✅' : fileIcon(ext)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
              {done ? 'Movido correctamente' : '📥 Nuevo archivo descargado'}
            </div>
            <div style={{
              fontSize: 13, fontWeight: 600, color: '#fff',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              lineHeight: 1.3,
            }}>
              {fileName}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {done ? `→ ${movedTo}` : fileSize}
            </div>
          </div>
          {!done && (
            <button onClick={handleIgnore} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)',
              cursor: 'pointer', padding: '2px 4px', fontSize: 18, lineHeight: 1,
              flexShrink: 0, transition: 'color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
            >×</button>
          )}
        </div>

        {/* Destinations */}
        {!done && (
          <>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              ¿A dónde va?
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {dests.map((dest) => (
                <button
                  key={dest.path}
                  onClick={() => handleMove(dest)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    transition: 'background 0.15s, border-color 0.15s, transform 0.1s',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(74,222,128,0.12)';
                    e.currentTarget.style.borderColor = 'rgba(74,222,128,0.3)';
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  <span style={{ fontSize: 14 }}>{destIcon(dest.label)}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dest.label}</span>
                </button>
              ))}
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
