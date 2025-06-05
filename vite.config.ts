import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import nodePath from 'path';
import tsconfigPaths from 'vite-tsconfig-paths';

// Define values for Vite's `define` option
const defineValues: Record<string, unknown> = {
  'process.env': {}, // Shim for libraries expecting process.env
};

// Only shim process.platform for non-test environments (dev server, build)
// Vitest provides its own Node.js environment where process.platform is native.
if (process.env.VITEST !== 'true') {
  defineValues['process.platform'] = JSON.stringify('browser'); // Shim for libraries expecting process.platform
}

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      '@shared': nodePath.resolve(__dirname, './shared'),
      '@': nodePath.resolve(__dirname, './src'),

      // Add shims for Node built-ins
      path: 'path-browserify',
      util: 'util',
    },
  },
  base: './',
  build: {
    outDir: 'dist/renderer',
    chunkSizeWarningLimit: 42000,
  },
  define: defineValues,
  server: {
    port: 3042,
    strictPort: true,
  },
});
