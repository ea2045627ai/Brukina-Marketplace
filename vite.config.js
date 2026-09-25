/**
 * BRUKINA MARKETPLACE - BUNDLER ENGINE CONFIGURATION
 * Path: vite.config.js
 * Optimizes static PWA assets, handles esbuild stripping, and structures high-performance code split chunks.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0'
  },
  build: {
    outDir: 'dist',
    // FIXED: Switched from terser to native esbuild to prevent external dependency build crashes
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Optimizes mobile loading latency across Accra networks via strategic chunk splitting
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
  // FIXED: Implemented native esbuild minifier compression configurations to safely drop console logs
  esbuild: {
    drop: ['console', 'debugger']
  }
});
