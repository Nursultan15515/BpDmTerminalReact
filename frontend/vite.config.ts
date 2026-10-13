import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Терминалы — Windows 7 и Chrome 103 (выше 109 Chrome на Win7 не обновится).
    // По умолчанию Vite собирает под Chrome 111+, поэтому цель задана явно.
    target: 'chrome103',
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5115',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
