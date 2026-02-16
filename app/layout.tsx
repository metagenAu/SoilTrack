import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SoilTrack | Metagen AUS',
  description: 'Trial management and soil health tracking platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}
