import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nunito } from "next/font/google";

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'The Royal Dispatch',
  description: 'Personalized princess letters for Emma',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Royal Dispatch',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  themeColor: '#b085d8',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html suppressHydrationWarning>
      <body className={`${nunito.variable} min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
