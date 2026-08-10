import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const clientRoot = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, '');
  return {
    root: clientRoot,
    envDir: projectRoot,
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_DEV_API_TARGET || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
