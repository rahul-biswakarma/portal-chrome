import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, cpSync } from 'fs';
import tailwindcss from '@tailwindcss/vite';

// Function to recursively copy directory
function copyDir(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'copy-manifest-and-assets',
      apply: 'build',
      closeBundle: () => {
        // This ensures the copy happens after the build is complete
        try {
          // Copy manifest.json
          copyFileSync('src/manifest.json', 'dist/manifest.json');
          console.log('✅ manifest.json copied to dist/');

          // Copy icons folder
          if (existsSync('src/icons')) {
            if (!existsSync('dist/icons')) {
              mkdirSync('dist/icons', { recursive: true });
            }
            copyDir('src/icons', 'dist/icons');
            console.log('✅ icons folder copied to dist/icons');
          } else {
            console.error('❌ src/icons folder not found!');
          }
        } catch (error) {
          console.error('❌ Error copying files:', error);
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
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: 'src/popup.html',
        background: 'src/background.ts',
        content: 'src/content.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
    emptyOutDir: true,
    // Add terser options to prevent variable name conflicts
    minify: 'terser',
    terserOptions: {
      mangle: {
        // Prevent variable name collisions
        keep_fnames: true,
        toplevel: false,
      },
    },
  },
});
