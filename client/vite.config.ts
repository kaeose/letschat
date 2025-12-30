import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages deployment usually requires setting the base.
  // If you are deploying to https://<USERNAME>.github.io/<REPO>/, this should be '/<REPO>/'
  // For safety, we default to a relative path, which works in most static hosting environments.
  base: '/letschat/',
})
