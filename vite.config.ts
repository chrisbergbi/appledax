import { defineConfig } from 'vite';

export default defineConfig({
  base: '/appledax/',
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api/query': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
  },
});
