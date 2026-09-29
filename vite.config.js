import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: Number(process.env.VITE_PORT || 5199),
    /* storage refs are relative URLs (/storage/images/...): in dev they
       must reach the agent server on 5200 (or PORT / VITE_AGENT_PORT) */
    proxy: {
      '/storage': `http://localhost:${process.env.PORT || process.env.VITE_AGENT_PORT || 5200}`,
      '/api': `http://localhost:${process.env.PORT || process.env.VITE_AGENT_PORT || 5200}`,
    },
  },
})
