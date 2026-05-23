import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FileOrganizer — Download',
};

export default function PopupLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, padding: 0, background: 'transparent', overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  );
}
