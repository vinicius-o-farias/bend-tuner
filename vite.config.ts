import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4321,
    strictPort: false,
    host: 'localhost',
  },
  preview: {
    port: 4321,
  },
});
