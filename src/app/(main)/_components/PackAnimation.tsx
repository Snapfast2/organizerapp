'use client';
import { Film, Archive, Music, FileText, Code, Image as ImageIcon, Package } from 'lucide-react';
import { motion } from 'framer-motion';

// ─── Pack Success Animation ───────────────────────────────────────────────────
const FLY_ICONS = [Film, Archive, Music, FileText, Code, ImageIcon] as const;

// Timing constants — single source of truth for ALL animations
const ICON_DUR       = 1.2;   // how long an icon travels
const ICON_STEP      = 0.22;  // stagger between icons
const REPEAT_DELAY   = 2.2;   // pause before repeating
const CYCLE          = ICON_DUR + REPEAT_DELAY; // 3.4 s — the shared loop period
const N              = FLY_ICONS.length;        // 6

// Build keyframe arrays for the circle & box that pulse exactly when each icon arrives.
const ARRIVAL_FRAC = 0.67;

function buildPulseKFs() {
  const PW = 0.022;
  const times: number[]   = [0];
  const scaleKF: number[] = [1];
  const bgKF: string[]    = ['rgba(14,201,0,0.15)'];
  const bdKF: string[]    = ['rgba(14,201,0,0.40)'];

  for (let i = 0; i < N; i++) {
    const t = (i * ICON_STEP + ICON_DUR * ARRIVAL_FRAC) / CYCLE;
    times.push(  Math.max(0, t - PW),  t,           t + PW,              Math.min(1, t + PW * 3));
    scaleKF.push(1,                    1.24,         0.90,                1);
    bgKF.push(   'rgba(14,201,0,0.15)','rgba(14,201,0,0.45)','rgba(14,201,0,0.20)','rgba(14,201,0,0.15)');
    bdKF.push(   'rgba(14,201,0,0.40)','rgba(14,201,0,0.95)','rgba(14,201,0,0.55)','rgba(14,201,0,0.40)');
  }

  if (times[times.length - 1] < 1) {
    times.push(1); scaleKF.push(1);
    bgKF.push('rgba(14,201,0,0.15)'); bdKF.push('rgba(14,201,0,0.40)');
  }

  return { times, scaleKF, bgKF, bdKF };
}

const { times: pulseTimes, scaleKF, bgKF, bdKF } = buildPulseKFs();

const loopTransition = {
  duration: CYCLE,
  repeat: Infinity,
  ease: 'linear' as const,
  times: pulseTimes,
};

export default function PackAnimation() {
  return (
    <div style={{ position: 'relative', height: 180, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

      {/* ── Circle — flashes on each icon arrival ── */}
      <motion.div
        animate={{ background: bgKF, borderColor: bdKF }}
        transition={loopTransition}
        style={{
          width: 90, height: 90, borderRadius: '50%',
          border: '2px solid rgba(14,201,0,0.40)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--accent)', position: 'relative', zIndex: 2,
        }}
      >
        {/* ── Package box — pops on each icon arrival ── */}
        <motion.div
          animate={{ scale: scaleKF }}
          transition={loopTransition}
        >
          <Package size={44} strokeWidth={1.5} />
        </motion.div>
      </motion.div>

      {/* ── Flying icons — bezier curves from all directions ── */}
      {FLY_ICONS.map((Icon, i) => {
        const rad    = (i / N) * Math.PI * 2;
        const startX = Math.cos(rad) * 140;
        const startY = Math.sin(rad) * 110;
        const perpRad = rad + Math.PI / 2;
        const midX  = startX * 0.5 + Math.cos(perpRad) * 52;
        const midY  = startY * 0.5 + Math.sin(perpRad) * 52;
        return (
          <motion.div
            key={i}
            style={{ position: 'absolute', color: 'var(--accent)', display: 'flex', zIndex: 1 }}
            animate={{
              x:       [startX, midX, 0],
              y:       [startY, midY, 0],
              opacity: [0,      1,    0],
              scale:   [1.4,    1.05, 0.1],
            }}
            transition={{
              delay:       i * ICON_STEP,
              duration:    ICON_DUR,
              repeat:      Infinity,
              repeatDelay: REPEAT_DELAY,
              ease:        [0.22, 0.44, 0.45, 0.95],
              times:       [0, 0.48, 1],
            }}
          >
            <Icon size={26} strokeWidth={1.5} />
          </motion.div>
        );
      })}
    </div>
  );
}
