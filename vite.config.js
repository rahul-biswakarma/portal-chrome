import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { copyFileSync, mkdirSync, existsSync, readdirSync, } from 'fs';
import tailwindcss from '@tailwindcss/vite';
// Function to recursively copy directory
function copyDir(src, dest) {
    if (!existsSync(dest)) {
        mkdirSync(dest, { recursive: true });
    }
    var entries = readdirSync(src, { withFileTypes: true });
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var entry = entries_1[_i];
        var srcPath = path.join(src, entry.name);
        var destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        }
        else {
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
            closeBundle: function () {
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
                    }
                    else {
                        console.error('❌ src/icons folder not found!');
                    }
                }
                catch (error) {
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
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'index.html'),
                background: path.resolve(__dirname, 'src/background.ts'),
                content: path.resolve(__dirname, 'src/content.ts'),
            },
            output: {
                entryFileNames: function (chunkInfo) {
                    return chunkInfo.name === 'background' || chunkInfo.name === 'content'
                        ? '[name].js'
                        : 'assets/[name]-[hash].js';
                },
                // Prevent variable name collisions
                manualChunks: undefined,
            },
        },
        outDir: 'dist',
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
