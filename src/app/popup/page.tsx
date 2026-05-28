'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { 
  FileIcon, Video, Image as ImageIcon, Music, FileText, FileArchive, 
  Clapperboard, FolderOpen, Monitor, CheckCircle2, X
} from 'lucide-react';
import ClickSpark from '@/components/ui/click-spark';
import BorderGlow from '@/components/ui/border-glow';

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
  const isAE     = params.get('ae') === '1';

  const [visible, setVisible] = useState(false);
  const [moving, setMoving] = useState(false);
  const [done, setDone] = useState(false);
  const [movedTo, setMovedTo] = useState('');
  const [deleteOriginal, setDeleteOriginal] = useState(false);
  
  // Mouse tracking for reactive MagicCard effect
  const [mouseX, setMouseX] = useState(-1000);
  const [mouseY, setMouseY] = useState(-1000);
  
  // Progress bar for 15s timeout
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    document.body.classList.add('popup-page');
    document.documentElement.classList.add('popup-page');
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    setTimeout(() => setVisible(true), 50);
    
    // Start progress bar animation
    const t = setTimeout(() => setProgress(0), 100);

    return () => {
      document.body.classList.remove('popup-page');
      document.documentElement.classList.remove('popup-page');
      clearTimeout(t);
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMouseX(e.clientX - rect.left);
    setMouseY(e.clientY - rect.top);
  };

  const handleMouseLeave = () => {
    setMouseX(-1000);
    setMouseY(-1000);
  };

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

  const handleAEImport = () => {
    if (moving) return;
    setMoving(true);
    const api = (window as any).electronAPI;
    if (api) {
      api.popupImportAE(filePath, deleteOriginal);
    }
    setMovedTo('After Effects');
    setDone(true);
    setTimeout(() => api?.popupIgnore(), 1600);
  };

  const MainIcon = done ? CheckCircle2 : getFileIcon(ext);

  return (
    <ClickSpark sparkColor="#4ade80" sparkSize={6} sparkRadius={20} sparkCount={4} duration={300} extraScale={0.6}>
      <div 
        onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        width: '100vw', height: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, margin: 0, boxSizing: 'border-box',
        background: 'transparent',
        overflow: 'hidden',
        '--mouse-x': `${mouseX}px`,
        '--mouse-y': `${mouseY}px`,
      } as React.CSSProperties}
    >
      <BorderGlow
        className="w-full h-full"
        style={{
          transform: visible ? 'scale(1)' : 'scale(0.95)',
          opacity: visible ? 1 : 0,
          transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease',
          WebkitAppRegion: 'drag',
        }}
        backgroundColor="rgba(26, 26, 26, 0.96)"
        glowColor="74 222 128"
        edgeSensitivity={30}
        borderRadius={16}
        glowRadius={40}
        glowIntensity={1}
        coneSpread={25}
        animated={false}
      >
        
        {/* Reactive Background Glow inside inner content */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(400px circle at var(--mouse-x) var(--mouse-y), rgba(74,222,128,0.08), transparent 40%)`,
          zIndex: 0,
          pointerEvents: 'none',
          transition: 'background 0.15s ease',
        }} />

        {(done && movedTo === "After Effects") ? (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative', zIndex: 2,
            borderRadius: 15,
            background: 'transparent',
          }}>
            {/* Green flash background */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(circle at center, rgba(74,222,128,0.3) 0%, transparent 60%)',
              animation: 'ae-flash-green 1.5s ease-out forwards',
              borderRadius: 15,
            }} />
            
            {/* Container for the icons */}
            <div style={{ position: 'relative', width: 60, height: 60 }}>
              {/* Animated Checkmark */}
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="60" height="60" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="35" fill="none" stroke="#4ade80" strokeWidth="5" strokeDasharray="220" strokeDashoffset="220" style={{ animation: 'ae-draw-circle 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }} />
                  <path d="M35 50 L45 60 L65 40" fill="none" stroke="#4ade80" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="100" strokeDashoffset="100" style={{ animation: 'ae-draw-check 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s forwards' }} />
                </svg>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div style={{
              width: '100%',
              position: 'relative',
              zIndex: 2,
              padding: '12px 14px 10px',
              fontFamily: "'Inter', -apple-system, sans-serif",
              color: '#fff',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              borderRadius: 15, // Inner radius slightly less than outer
              background: 'transparent',
              boxSizing: 'border-box',
            }}>
              
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 6,
                background: 'rgba(74, 222, 128, 0.1)',
                border: '1px solid rgba(74, 222, 128, 0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <MainIcon size={18} color="var(--accent)" strokeWidth={2} />
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                <div style={{ fontSize: 9, color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
                  {done ? 'Movido correctamente' : 'Nuevo archivo descargado'}
                </div>
                <div style={{
                  fontSize: 13, fontWeight: 500, color: '#fff',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  lineHeight: 1.3,
                }}>
                  {fileName}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 1 }}>
                  {done ? `→ ${movedTo}` : fileSize}
                </div>
              </div>
              {!done && (
                <button onClick={handleIgnore} style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'color 0.15s, background 0.15s', borderRadius: 6,
                  WebkitAppRegion: 'no-drag',
                } as any}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Destinations */}
            {!done && (
              <>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                  ¿A dónde va?
                </div>
                {isAE && (
                  <>
                    <button
                      onClick={handleAEImport}
                      style={{
                        background: 'rgba(215, 142, 255, 0.08)',
                        border: '1px solid rgba(215, 142, 255, 0.2)',
                        borderRadius: 6,
                        padding: '8px 10px',
                        color: '#e5b3ff',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        transition: 'all 0.15s ease',
                        width: '100%',
                        marginBottom: 4,
                        fontFamily: 'inherit',
                        WebkitAppRegion: 'no-drag',
                      } as any}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(215, 142, 255, 0.15)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(215, 142, 255, 0.08)'; }}
                    >
                      <Clapperboard size={14} color="#e5b3ff" strokeWidth={2.5} />
                      <span>Importar a After Effects</span>
                    </button>
                    {/* Delete original checkbox */}
                    <label
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        marginBottom: 6, cursor: 'pointer',
                        WebkitAppRegion: 'no-drag',
                      } as any}
                    >
                      <input
                        type="checkbox"
                        checked={deleteOriginal}
                        onChange={e => setDeleteOriginal(e.target.checked)}
                        style={{ accentColor: '#e5b3ff', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                        Eliminar original tras copiar al proyecto
                      </span>
                    </label>
                  </>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {dests.map((dest) => {
                    const DestIcon = getDestIcon(dest.label);
                    return (
                      <button
                        key={dest.path}
                        onClick={() => handleMove(dest)}
                        style={{
                          background: '#222',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 6,
                          padding: '8px 10px',
                          color: '#fff',
                          fontSize: 11.5,
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.1s ease',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                          WebkitAppRegion: 'no-drag',
                        } as any}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#2a2a2a';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.13)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = '#222';
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                        }}
                      >
                        <DestIcon size={14} color="var(--accent)" strokeWidth={2} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dest.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            </div>

            {/* Progress bar for auto-dismiss */}
            <div style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: 3,
              background: 'rgba(255,255,255,0.05)',
              zIndex: 3,
              overflow: 'hidden',
              borderRadius: '0 0 16px 16px',
            }}>
              <div style={{
                height: '100%',
                background: 'rgba(74, 222, 128, 0.6)',
                width: `${progress}%`,
                transition: 'width 15s linear',
                boxShadow: '0 0 8px rgba(74,222,128,0.5)',
              }} />
            </div>
          </>
        )}
      </BorderGlow>
      </div>

      <style precedence="default" href="popup-page-animations">{`
        @keyframes shrink { 0% { width: '100%'; } 100% { width: '0%'; } }
        
        @keyframes ae-flash-green { 
          0% { opacity: 1; transform: scale(0.9); } 
          100% { opacity: 0; transform: scale(1.2); } 
        }
        @keyframes ae-draw-circle {
          to { stroke-dashoffset: 0; }
        }
        @keyframes ae-draw-check {
          to { stroke-dashoffset: 0; }
        }
        @keyframes ae-icon-swap-out {
          0% { opacity: 1; transform: scale(1); }
          70% { opacity: 1; transform: scale(1.15); }
          100% { opacity: 0; transform: scale(0); }
        }
        @keyframes ae-icon-swap-in {
          0% { opacity: 0; transform: scale(0); filter: blur(10px); }
          60% { opacity: 1; transform: scale(1.15); filter: blur(0px); box-shadow: 0 0 50px rgba(217, 152, 255, 0.6); }
          100% { opacity: 1; transform: scale(1); filter: blur(0px); box-shadow: 0 0 30px rgba(217, 152, 255, 0.3); }
        }
      `}</style>
    </ClickSpark>
  );
}

export default function PopupPage() {
  return (
    <Suspense>
      <style precedence="default" href="popup-page-overrides">{`
        html, body {
          background: transparent !important;
          background-color: transparent !important;
          overflow: hidden !important;
        }
      `}</style>
      <PopupContent />
    </Suspense>
  );
}
