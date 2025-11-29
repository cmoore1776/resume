import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Use placeholders for production build - docker-entrypoint.sh replaces these at runtime
    ...(process.env.NODE_ENV === 'production' ? {
      'import.meta.env.VITE_WS_URL': JSON.stringify('__VITE_WS_URL__'),
      'import.meta.env.VITE_API_URL': JSON.stringify('__VITE_API_URL__'),
      'import.meta.env.VITE_PUBLIC_POSTHOG_KEY': JSON.stringify('__VITE_PUBLIC_POSTHOG_KEY__'),
      'import.meta.env.VITE_PUBLIC_POSTHOG_HOST': JSON.stringify('__VITE_PUBLIC_POSTHOG_HOST__'),
    } : {}),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
