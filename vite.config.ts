import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.join(__dirname, 'src', 'app', 'ui'),
  build: {
    outDir: path.join(__dirname, 'dist', 'app'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src', 'app', 'ui'),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});
