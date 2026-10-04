/**
 * BRUKINA MARKETPLACE - BUNDLER ENGINE CONFIGURATION
 * Path: vite.config.js
 * Optimizes static PWA assets, handles esbuild stripping, and structures high-performance code split chunks.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  base: process.env.NODE_ENV === 'production'
    ? (process.env.GITHUB_ACTIONS ? '/Brukina-Marketplace/' : '/')
    : '/',

  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      // CONNECTS ALL INTERFACE REQUESTS DIRECTLY TO YOUR RUNNING PORT 3000 BACKEND
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        ws: true
      }
    }
  },
  
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('react')) return 'vendor-react-core';
            return 'vendor-libs';
          }
        }
      }
    }
  },
  
  esbuild: {
    pure: ['console.log', 'console.info', 'console.debug'],
    drop: ['debugger']
  }
});
