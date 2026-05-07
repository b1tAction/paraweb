import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
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
