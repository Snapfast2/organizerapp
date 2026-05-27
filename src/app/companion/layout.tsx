import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'MooMotion Companion' };

export default function CompanionLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" style={{ background: 'transparent' }}>
      <body style={{ margin: 0, padding: 0, background: 'transparent', overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  );
}
