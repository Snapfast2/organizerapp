import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FolderOpen, FileArchive, CheckCircle2, HardDrive } from 'lucide-react';

interface ShareModalProps {
  targetPath: string | null;
  onClose: () => void;
}

export default function ShareModal({ targetPath, onClose }: ShareModalProps) {
  const [step, setStep] = useState<'compressing' | 'copying' | 'done' | 'error'>('compressing');
  const [shareFolder, setShareFolder] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!targetPath) return;
    let isMounted = true;

    const startProcess = async () => {
      try {
        // 1. Comprimir
        setStep('compressing');
        const compRes = await fetch('/api/fs/compress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetPath }),
        });
        const compData = await compRes.json();
        if (!compRes.ok) throw new Error(compData.error || 'Error al comprimir');
        if (!isMounted) return;

        // 2. Copiar a Google Drive
        setStep('copying');
        const shareRes = await fetch('/api/fs/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zipPath: compData.zipPath, fileName: compData.zipName }),
        });
        const shareData = await shareRes.json();
        if (!shareRes.ok) throw new Error(shareData.error || 'Error al copiar a Google Drive');
        if (!isMounted) return;

        setShareFolder(shareData.shareFolder);
        setStep('done');

      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err.message);
          setStep('error');
        }
      }
    };

    startProcess();
    return () => { isMounted = false; };
  }, [targetPath]);

  if (!targetPath) return null;

  return (
    <AnimatePresence>
      <div className="modal-overlay" onClick={onClose}>
        <motion.div
          className="modal"
          style={{ width: 400, textAlign: 'center', padding: '32px 24px' }}
          onClick={e => e.stopPropagation()}
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
        >
          <button className="btn btn-ghost btn-icon" style={{ position: 'absolute', top: 10, right: 10 }} onClick={onClose}>
            <X size={16} />
          </button>

          {step === 'compressing' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(96,165,250,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <FileArchive size={32} color="#60a5fa" style={{ position: 'relative', zIndex: 1 }} />
                <motion.div
                  style={{ position: 'absolute', inset: 0, border: '2px solid #60a5fa', borderRadius: '50%', borderTopColor: 'transparent' }}
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', margin: 0 }}>Empaquetando...</h3>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Comprimiendo la carpeta en .zip</p>
            </motion.div>
          )}

          {step === 'copying' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(52,211,153,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <HardDrive size={32} color="#34d399" style={{ position: 'relative', zIndex: 1 }} />
                <motion.div
                  style={{ position: 'absolute', inset: 0, border: '2px solid #34d399', borderRadius: '50%', borderTopColor: 'transparent' }}
                  animate={{ rotate: -360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', margin: 0 }}>Copiando a Google Drive...</h3>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>Google Drive sincronizará el archivo automáticamente</p>
            </motion.div>
          )}

          {step === 'done' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={36} color="#34d399" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', margin: 0 }}>¡Listo! 🎉</h3>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
                El .zip fue copiado a <strong style={{ color: '#34d399' }}>MooMotion Shares</strong> en tu Google Drive.<br/>
                El Explorador ya está abierto para que puedas compartirlo.
              </p>

              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', width: '100%', textAlign: 'left' }}>
                <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 4px 0', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ubicación</p>
                <p style={{ fontSize: 12, color: '#60a5fa', margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>{shareFolder}</p>
              </div>

              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                💡 En el Explorador: clic derecho sobre el archivo → <strong>Compartir</strong>
              </p>

              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cerrar</button>
                <button
                  className="btn"
                  style={{ flex: 1, background: '#1a73e8', color: 'white' }}
                  onClick={() => {
                    if (shareFolder) fetch('/api/open-folder', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ filePath: shareFolder })
                    });
                  }}
                >
                  <FolderOpen size={14} /> Abrir carpeta
                </button>
              </div>
            </motion.div>
          )}

          {step === 'error' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={32} color="#ef4444" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', margin: 0 }}>Error</h3>
              <p style={{ fontSize: 13, color: '#fca5a5', margin: 0 }}>{errorMsg}</p>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={onClose}>Cerrar</button>
            </motion.div>
          )}

        </motion.div>
      </div>
    </AnimatePresence>
  );
}
