import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/developer-api': {
        target: 'http://127.0.0.1:4179',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/developer-api/, ''),
      },
      '/.netlify/functions': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
});
