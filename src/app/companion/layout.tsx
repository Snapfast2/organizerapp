import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'MooMotion Companion' };

export default function CompanionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Make html/body transparent for this route so the bubble floats cleanly */}
      <style>{`
        html, body {
          background: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
      `}</style>
      {children}
    </>
  );
}
