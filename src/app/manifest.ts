import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Flownexion ERP',
        short_name: 'Flownexion',
        description: 'Sistema de Gestión - Flownexion',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1E40AF',
        icons: [
            {
                src: '/favicon.ico',
                sizes: 'any',
                type: 'image/x-icon',
            },
            {
                src: '/logo.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/logo.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    }
}
