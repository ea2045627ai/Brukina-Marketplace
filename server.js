{
  "name": "brukina-marketplace",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Multi-channel marketplace PWA for wholesale trade and local delivery operations.",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "start": "node server.js",
    "start:railway": "node server.js",
    "check": "node scripts/check-build.mjs && npm run check:netlify && npm run check:render",
    "check:netlify": "node scripts/check-netlify.mjs",
    "check:render": "node scripts/check-render.mjs",
    "check:webhook": "node scripts/check-webhook.mjs"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.57.4",
    "cors": "^2.8.5",
    "express": "^5.1.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.1.1",
    "vite": "^8.2.2"
  }
}
