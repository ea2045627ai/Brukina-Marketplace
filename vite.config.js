/**
 * BRUKINA MARKETPLACE - BUNDLER ENGINE CONFIGURATION
 * Path: vite.config.js
 * Optimizes static PWA assets, handles esbuild stripping, and structures high-performance code split chunks.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  // FIXED: Implemented a dynamic base path router to accommodate free GitHub Pages subdomain routing architectures
  // If running via standard local development servers (npm run dev), it safely fallbacks onto root routes automatically
  base: process.env.NODE_ENV === 'production' ? '/brukina-marketplace/' : '/',

  server: {
    port: 5173,
    host: '0.0.0.0'
  },
  
  build: {
    outDir: 'dist',
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
  
  // FIXED: Restructured compressor configurations to keep error telemetry active while stripping standard tracking logs
  esbuild: {
    pure: ['console.log', 'console.info', 'console.debug'], // Safely strip development logging parameters
    drop: ['debugger'] // Drop explicit execution hooks during build generation cycles
  }
});
