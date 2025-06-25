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
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true
      }
    }
  },
  build: {
    // Disable source maps in production for security and performance
    sourcemap: false,
    // Minify more aggressively in production
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,  // Remove console.* calls
        drop_debugger: true, // Remove debugger statements
        pure_funcs: ['console.log', 'console.debug', 'console.info']
      }
    },
    // Glitch environment considerations
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router'],
          'socket-vendor': ['socket.io-client']
        }
      }
    }
  },
  // Define global constants for the app
  define: {
    // Ensure NODE_ENV is set to 'production'
    'process.env.NODE_ENV': JSON.stringify('production')
  }
})