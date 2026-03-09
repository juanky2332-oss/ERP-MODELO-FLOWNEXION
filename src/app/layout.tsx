import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthLayout } from '@/components/layout/auth-layout'
import { Providers } from '@/components/providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Flownexion - ERP',
  description: 'Sistema de Gestión Administrativa para Flownexion',
  manifest: '/manifest.json', // Next.js generates this automatically from manifest.ts
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Flownexion',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: '#1E40AF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Prevents zooming for app-like feel
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <Providers>
          <AuthLayout>{children}</AuthLayout>
        </Providers>
      </body>
    </html>
  )
}
