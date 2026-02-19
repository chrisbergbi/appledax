import { defineConfig } from 'vite';

export default defineConfig({
  base: '/appledax/',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
  },
});
