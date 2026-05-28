import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'MooMotion Popup',
};

export default function PopupLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <head>
        <style precedence="default" href="popup-base-style">{`
          /* Pure transparent base */
          :root, html, body {
            background: transparent !important;
            background-color: transparent !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }

          /* Force hide Next.js dev indicators globally */
          nextjs-portal,
          #__next-build-watcher,
          [data-nextjs-toast],
          [data-nextjs-dialog] {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
        `}</style>
      </head>
      <body style={{ background: 'transparent' }}>
        {children}
      </body>
    </html>
  );
}
