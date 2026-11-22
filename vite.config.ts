import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the built site works inside a GitHub Pages sub-folder
export default defineConfig({
  base: './',
  plugins: [react()],
})
