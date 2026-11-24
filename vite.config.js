import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/tanda-manager/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png', 'icons/tanda-192.png', 'icons/tanda-512.png', 'icons/tanda-maskable-512.png'],
      workbox: {
        // Default patterns skip fonts. Latin woff2 only, so the precache stays small.
        globPatterns: ['**/*.{js,css,html,woff2}'],
        // The organizer app needs the network anyway. Leaving it out keeps members'
        // phones from downloading it in the background.
        globIgnores: ['**/AdminGate-*.js'],
      },
      manifest: {
        name: 'Tanda Manager',
        short_name: 'Tanda',
        description: 'Rotating savings group manager',
        theme_color: '#127A74',
        background_color: '#FBF8F3',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/tanda-manager/',
        icons: [
          { src: 'icons/tanda-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/tanda-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/tanda-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Libraries change less often than the app. Separate files stay cached across deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@supabase')) return 'supabase'
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    // Vitest 4 runs with base '/'. Keep BASE_URL the same as the deployed site.
    env: { BASE_URL: '/tanda-manager/' },
  },
})
