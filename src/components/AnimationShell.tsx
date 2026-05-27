'use client';

import { useEffect, useRef, useCallback } from 'react';
import { motion, useAnimate, useReducedMotion } from 'framer-motion';
import { useGenieMinimize } from '@/hooks/useGenieMinimize';

/**
 * AnimationShell — Framer Motion CSS layer + Genie canvas layer.
 *
 * Layer 1 (Electron main):  moves + resizes + fades the OS window
 * Layer 2 (Framer Motion):  spring CSS animations for show/hide
 * Layer 3 (Genie canvas):   scanline distortion on minimize (experiment branch)
 */
export default function AnimationShell({ children }: { children: React.ReactNode }) {
  const [scope, animate] = useAnimate();
  const prefersReduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // ── Spring configs ─────────────────────────────────────────────
  const springIn      = { type: 'spring' as const, stiffness: 220, damping: 22, mass: 0.9 };
  const springRestore = { type: 'spring' as const, stiffness: 180, damping: 18, mass: 1 };

  // ── Genie hook ─────────────────────────────────────────────────
  // When the Genie animation completes → tell main to minimize the OS window
  const handleMinimizeDone = useCallback(() => {
    // Use minimizeExecute — tells main to call win.minimize() directly,
    // skipping the will-minimize IPC (avoids triggering Genie again)
    (window as any).electronAPI?.minimizeExecute?.();
  }, []);

  const { triggerGenie } = useGenieMinimize({
    targetRef: rootRef,
    onMinimizeDone: handleMinimizeDone,
  });

  // ── Listen to IPC events from Electron main ────────────────────
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onWindowAnimate) return;

    // Will-hide: closing to tray — simple CSS fade
    const handleWillHide = () => {
      if (prefersReduced) return;
      animate(scope.current, {
        scale: 0.94, opacity: 0.6, filter: 'blur(6px)',
      }, { duration: 0.18, ease: [0.4, 0, 1, 1] });
    };

    // Will-minimize: GENIE effect instead of CSS squish
    const handleWillMinimize = () => {
      if (prefersReduced) {
        // Accessibility fallback — just hide content
        animate(scope.current, { opacity: 0 }, { duration: 0.18 });
        return;
      }
      // Hide the real content so the canvas overlay takes over visually
      animate(scope.current, { opacity: 0 }, { duration: 0.05 });
      // Trigger Genie canvas animation
      triggerGenie();
    };

    // Did-show: spring in from bottom (restore or tray open)
    const handleDidShow = async () => {
      if (prefersReduced) {
        animate(scope.current, { scale: 1, opacity: 1, filter: 'blur(0px)', y: 0 }, { duration: 0 });
        return;
      }
      // Force reset to start state
      await animate(scope.current, {
        scale: 0.90, opacity: 0, filter: 'blur(12px)', y: 30,
      }, { duration: 0 });
      // Spring in
      animate(scope.current, {
        scale: 1, opacity: 1, filter: 'blur(0px)', y: 0,
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
  }, [prefersReduced, triggerGenie]);

  return (
    <motion.div
      ref={(el) => {
        // Set both the Framer scope ref and our rootRef for html-to-image
        (scope as any).current = el;
        rootRef.current = el;
      }}
      // ── Mount animation (app launch) ────────────────────────────
      initial={prefersReduced ? false : {
        opacity: 0, scale: 0.90, filter: 'blur(12px)', y: 20,
      }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', y: 0 }}
      transition={prefersReduced ? { duration: 0 } : {
        ...springIn,
        filter: { duration: 0.35, ease: 'easeOut' },
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
