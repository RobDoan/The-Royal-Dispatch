import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Geist } from "next/font/google";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
  return children
}
