import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// API host the dev server proxies to. Override to point a second client at a
// second server (e.g. an audit instance on another port).
const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      // Uploaded images (account avatars, merchant + institution logos) are
      // served by the API host; proxy them so <img src="/uploads/..."> works in dev.
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
    fs: {
      allow: ['../..'],
    },
  },
});
