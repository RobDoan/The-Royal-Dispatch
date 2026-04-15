import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['300', '400', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Royal Dispatch Admin',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} flex h-screen overflow-hidden`}>
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
