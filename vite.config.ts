import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    // Pre-compress static assets with gzip for nginx gzip_static
    viteCompression({ algorithm: 'gzip', threshold: 1024 }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-phaser': ['phaser'],
          'vendor-nakama': ['@heroiclabs/nakama-js'],
          'vendor-state': ['zustand'],
        },
      },
    },
  },
});