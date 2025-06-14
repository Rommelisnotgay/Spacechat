import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000',
        changeOrigin: true
      },
      '/socket.io': {
        target: process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000',
        changeOrigin: true,
        ws: true
      }
    }
  },
  build: {
    // Generate source maps for better debugging
    sourcemap: true,
    // Glitch environment considerations
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router'],
          'socket-vendor': ['socket.io-client']
        }
      }
    }
  }
}) 