import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'The Royal Dispatch',
  description: 'Personalized princess letters for Emma',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
