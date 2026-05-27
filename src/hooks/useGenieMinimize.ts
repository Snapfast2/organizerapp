'use client';

import { useEffect, useRef, useCallback } from 'react';
import { toCanvas } from 'html-to-image';

// ── Math helpers (same as ui-layouts reference) ────────────────────────────
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp  = (a: number, b: number, t: number)   => a + (b - a) * t;
const eioC  = (t: number) =>                         // ease-in-out cubic
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eIn2  = (t: number) => t * t;                 // ease-in quadratic (Y collapse)

// ── Config ────────────────────────────────────────────────────────────────
const DUR  = 520;   // animation duration ms
const ROWS = 1;     // scanline step (1 = every pixel row — smoothest)

interface Pt { x: number; y: number }

/**
 * Draws one frame of the Genie distortion.
 *  rawT   → animation progress 0..1
 *  dir    → 'minimize' or 'restore'
 *  dock   → pixel position of the taskbar target (bottom-center of screen)
 *  win    → top-left of the app window in screen coords
 *  W, H   → canvas dimensions (= viewport size)
 *  winW/H → captured snapshot dimensions
 */
function renderGenie(
  ctx:  CanvasRenderingContext2D,
  snap: HTMLCanvasElement,
  W: number, H: number,
  winW: number, winH: number,
  rawT: number,
  dir:  'minimize' | 'restore',
  dock: Pt,
  win:  Pt,
): void {
  ctx.clearRect(0, 0, W, H);

  for (let y = 0; y < winH; y += ROWS) {
    const r = y / winH;

    // Each row starts compressing at a different time → Genie cascade
    const rowXStart = dir === 'minimize' ? (1 - r) * 0.6 : r * 0.6;
    const xP  = clamp((rawT - rowXStart) / (1 - rowXStart), 0, 1);
    const xE  = eioC(xP);

    const rowYStart = dir === 'minimize' ? (1 - r) * 0.18 : r * 0.18;
    const yP  = clamp((rawT - rowYStart) / (1 - rowYStart), 0, 1);
    const yE  = eIn2(yP);

    let left: number, right: number, destY: number;

    if (dir === 'minimize') {
      left  = lerp(win.x,         dock.x, xE);
      right = lerp(win.x + winW,  dock.x, xE);
      destY = lerp(win.y + y,     dock.y, yE);
    } else {
      left  = lerp(dock.x, win.x,         xE);
      right = lerp(dock.x, win.x + winW,  xE);
      destY = lerp(dock.y, win.y + y,     yE);
    }

    const rowW = right - left;
    if (rowW < 0.5) continue;

    ctx.drawImage(snap, 0, y, winW, ROWS, left, destY, rowW, ROWS);
  }

  // Soft glow near the dock target at the end of the animation
  const glowRaw = dir === 'minimize' ? rawT : 1 - rawT;
  if (glowRaw > 0.78) {
    const a = ((glowRaw - 0.78) / 0.22) * 0.22;
    const g = ctx.createRadialGradient(dock.x, dock.y, 0, dock.x, dock.y, 60);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

// ── Main hook ─────────────────────────────────────────────────────────────
interface UseGenieMinimizeOptions {
  /** Element to snapshot (defaults to document.documentElement) */
  targetRef?: React.RefObject<HTMLElement | null>;
  /** Called when minimize animation is done — use this to trigger win.minimize() */
  onMinimizeDone: () => void;
}

export function useGenieMinimize({ targetRef, onMinimizeDone }: UseGenieMinimizeOptions) {
  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const animRef    = useRef<number | null>(null);
  const running    = useRef(false);

  // Create and attach the overlay canvas once
  useEffect(() => {
    const canvas   = document.createElement('canvas');
    canvas.id      = 'genie-overlay';
    canvas.style.cssText = [
      'position:fixed', 'inset:0', 'width:100vw', 'height:100vh',
      'pointer-events:none', 'z-index:99999', 'display:none',
    ].join(';');
    document.body.appendChild(canvas);
    canvasRef.current = canvas;

    return () => { canvas.remove(); };
  }, []);

  const animate = useCallback(async () => {
    if (running.current) return;
    running.current = true;

    const canvas = canvasRef.current;
    if (!canvas) { onMinimizeDone(); running.current = false; return; }

    // Resize canvas to viewport
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;
    canvas.style.display = 'block';

    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.style.display = 'none'; onMinimizeDone(); running.current = false; return; }

    // ── 1. Snapshot the page content ────────────────────────────────────
    let snap: HTMLCanvasElement;
    try {
      const target = targetRef?.current ?? document.documentElement;
      snap = await toCanvas(target, {
        pixelRatio:  1,
        cacheBust:   false,
        skipFonts:   true,   // skip font serialization for speed
        width:  W,
        height: H,
      });
    } catch (e) {
      console.warn('[Genie] snapshot failed, falling back', e);
      canvas.style.display = 'none';
      onMinimizeDone();
      running.current = false;
      return;
    }

    // ── 2. Compute geometry ──────────────────────────────────────────────
    // Dock target = bottom-center of the viewport (taskbar direction)
    const dock: Pt = { x: W / 2, y: H + 20 };
    // Window = top-left of viewport (our app fills the whole window)
    const win: Pt  = { x: 0, y: 0 };
    const winW = W, winH = H;

    // ── 3. Animate ───────────────────────────────────────────────────────
    const start = performance.now();

    const frame = (now: number) => {
      const rawT = Math.min((now - start) / DUR, 1);
      renderGenie(ctx, snap, W, H, winW, winH, rawT, 'minimize', dock, win);

      if (rawT < 1) {
        animRef.current = requestAnimationFrame(frame);
      } else {
        // Animation done
        canvas.style.display = 'none';
        ctx.clearRect(0, 0, W, H);
        running.current = false;
        onMinimizeDone();
      }
    };

    animRef.current = requestAnimationFrame(frame);
  }, [targetRef, onMinimizeDone]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
  }, []);

  return { triggerGenie: animate };
}
