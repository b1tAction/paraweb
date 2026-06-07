import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import viteCompression from 'vite-plugin-compression';

const DEFAULT_DEV_NAKAMA_ENDPOINT = '127.0.0.1:17350';

function resolveNakamaEndpoint(command: 'serve' | 'build'): string | undefined {
  const configuredEndpoint = process.env.VITE_NAKAMA_ENDPOINT?.trim();
  if (configuredEndpoint) {
    return configuredEndpoint;
  }

  if (command === 'serve') {
    return DEFAULT_DEV_NAKAMA_ENDPOINT;
  }

  return undefined;
}

export default defineConfig(({ command }) => {
  const nakamaEndpoint = resolveNakamaEndpoint(command);

  return {
    base: process.env.VITE_BASE_PATH || './',
    ...(nakamaEndpoint
      ? {
          define: {
            'import.meta.env.VITE_NAKAMA_ENDPOINT': JSON.stringify(nakamaEndpoint),
          },
        }
      : {}),
    plugins: [
      react(),
      // Pre-compress static assets with gzip for nginx gzip_static
      viteCompression({ algorithm: 'gzip', threshold: 1024 }),
    ],
    server: {
      port: 5173,
      host: true,
      allowedHosts: true,
    },
    build: {
      chunkSizeWarningLimit: 1800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/')
            ) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/phaser/')) {
              return 'vendor-phaser';
            }
            if (id.includes('node_modules/@heroiclabs/nakama-js/')) {
              return 'vendor-nakama';
            }
            if (id.includes('node_modules/zustand/')) {
              return 'vendor-state';
            }
          },
        },
      },
    },
  };
});
