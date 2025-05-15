import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { copyFileSync } from 'fs';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'copy-manifest',
      apply: 'build',
      closeBundle: () => {
        // This ensures the copy happens after the build is complete
        try {
          copyFileSync('src/manifest.json', 'dist/manifest.json');
          console.log('✅ manifest.json copied to dist/');
        } catch (error) {
          console.error('❌ Error copying manifest.json:', error);
        }
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        background: path.resolve(__dirname, 'src/background.ts'),
        content: path.resolve(__dirname, 'src/content.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === 'background' || chunkInfo.name === 'content'
            ? '[name].js'
            : 'assets/[name]-[hash].js';
        },
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
