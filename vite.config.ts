import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import path from 'node:path'

export default defineConfig({
  plugins: [
    react(),
    // Old iOS WebViews (e.g. the Web MIDI Browser app) choke on the modern
    // ES2020 bundle; ship a transpiled + polyfilled fallback for them
    legacy({
      targets: ['defaults', 'ios_saf >= 11'],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vexflow: ['vexflow'],
        },
      },
    },
  },
})
