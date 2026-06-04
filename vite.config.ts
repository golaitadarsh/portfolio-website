import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg'],
  build: {
    // Split three.js into its own chunk so it caches independently of app code
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
    // Suppress noisy warning — three is unavoidably ~500kB
    chunkSizeWarningLimit: 700,
  },
})
