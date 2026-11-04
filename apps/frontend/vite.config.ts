/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the UI calls /api/... on its own origin and Vite forwards the request to the NestJS API, so the
// browser never makes a cross-origin call and the API needs no CORS settings. API_URL changes the target.
const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiUrl, rewrite: (path) => path.replace(/^\/api/, '') }
    }
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: apiUrl, rewrite: (path) => path.replace(/^\/api/, '') }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true
  }
});
