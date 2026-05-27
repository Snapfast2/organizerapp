import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../globals.css';
import AnimationShell from '@/components/AnimationShell';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'FileOrg — Organizador de Archivos',
  description: 'Explora, organiza y gestiona los archivos de tu PC con una interfaz moderna.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <AnimationShell>{children}</AnimationShell>
      </body>
    </html>
  );
}
