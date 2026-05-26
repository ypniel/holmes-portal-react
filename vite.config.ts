import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      // Proxy HubSpot API to avoid CORS in dev
      "/hubspot-api": {
        target: "https://api.hubapi.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hubspot-api/, ""),
      },
    },
  },
})
