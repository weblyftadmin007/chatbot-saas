import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/main.tsx',
      name: 'ChatbotWidget',
      // Function form so the built file is exactly 'widget.js' (Vite would
      // otherwise append the format suffix, e.g. 'widget.iife.js')
      fileName: () => 'widget.js',
      formats: ['iife']
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    target: 'es2020'
  },
  define: {
    'process.env': {}
  }
})