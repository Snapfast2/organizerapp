import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'MooMotion Companion' };

export default function CompanionLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        /* Transparent background for the companion window */
        html, body, #__next, [data-reactroot] {
          background: transparent !important;
          background-color: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }

        /* Hide the Next.js dev-mode indicator ("N" button) */
        nextjs-portal,
        #__next-build-watcher,
        [data-nextjs-toast],
        [data-nextjs-dialog],
        [data-nextjs-refresh-indicator],
        button[data-nextjs-refresh-indicator] {
          display: none !important;
        }
      `}</style>
      {children}
    </>
  );
}
