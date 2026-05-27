'use client';

import { useEffect, useRef } from 'react';
import { motion, useAnimate, useReducedMotion } from 'framer-motion';

/**
 * AnimationShell — Framer Motion CSS layer that runs simultaneously with
 * Electron's native window animations (setBounds / setOpacity).
 *
 * Layer 1 (Electron main): moves + resizes + fades the OS window
 * Layer 2 (this component): spring-animates the page content inside
 *
 * Both layers play at the same time → premium double-depth effect.
 */
export default function AnimationShell({ children }: { children: React.ReactNode }) {
  const [scope, animate] = useAnimate();
  const prefersReduced = useReducedMotion();
  const ready = useRef(false);

  // ── Spring configs ────────────────────────────────────────────
  const springIn = { type: 'spring' as const, stiffness: 220, damping: 22, mass: 0.9 };
  const springRestore = { type: 'spring' as const, stiffness: 180, damping: 18, mass: 1 };

  // ── Listen to IPC events from Electron main ───────────────────
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onWindowAnimate) return; // running in browser dev, skip

    const handleWillHide = () => {
      if (prefersReduced) return;
      animate(scope.current, {
        scale: 0.94,
        opacity: 0.6,
        filter: 'blur(6px)',
      }, { duration: 0.18, ease: [0.4, 0, 1, 1] });
    };

    const handleWillMinimize = () => {
      if (prefersReduced) return;
      animate(scope.current, {
        scale: 0.88,
        opacity: 0,
        filter: 'blur(10px)',
        y: 40,
      }, { duration: 0.28, ease: [0.4, 0, 1, 1] });
    };

    const handleDidShow = async () => {
      if (prefersReduced) {
        animate(scope.current, { scale: 1, opacity: 1, filter: 'blur(0px)', y: 0 }, { duration: 0 });
        return;
      }
      // Force reset to start state instantly (clears any stale blur/opacity from will-hide)
      await animate(scope.current, {
        scale: 0.90,
        opacity: 0,
        filter: 'blur(12px)',
        y: 30,
      }, { duration: 0 });
      // Then spring in
      animate(scope.current, {
        scale: 1,
        opacity: 1,
        filter: 'blur(0px)',
        y: 0,
      }, {
        ...springRestore,
        filter: { duration: 0.38, ease: 'easeOut' },
      });
    };

    const unsubs = [
      api.onWindowAnimate('will-hide',     handleWillHide),
      api.onWindowAnimate('will-minimize', handleWillMinimize),
      api.onWindowAnimate('did-show',      handleDidShow),
    ];

    return () => unsubs.forEach((fn: any) => fn?.());
  }, [prefersReduced]);

  return (
    <motion.div
      ref={scope}
      // ── Mount animation (app launch) ──────────────────────────
      initial={prefersReduced ? false : {
        opacity: 0,
        scale: 0.90,
        filter: 'blur(12px)',
        y: 20,
      }}
      animate={{
        opacity: 1,
        scale: 1,
        filter: 'blur(0px)',
        y: 0,
      }}
      transition={prefersReduced ? { duration: 0 } : {
        ...springIn,
        filter: { duration: 0.35, ease: 'easeOut' }, // blur clears slightly faster
      }}
      style={{
        width: '100%',
        height: '100vh',
        transformOrigin: 'center center',
        willChange: 'transform, opacity, filter',
      }}
    >
      {children}
    </motion.div>
  );
}
