// Vite dev server + build for the Aura web app.
// In dev, the React app runs on AURA_WEB_PORT and forwards API/media requests to the Node server.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiPort = process.env.AURA_PORT ?? '8790'
const webPort = Number(process.env.AURA_WEB_PORT ?? '5190')
const api = `http://127.0.0.1:${apiPort}`

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [react(), tailwindcss()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: api,
        // When the Node server restarts (node --watch), end the browser's side of the live stream
        // too. Otherwise the proxy keeps it open with nothing behind it, and the app silently stops
        // getting live events until a reload. Ending it makes EventSource reconnect by itself.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            proxyRes.on('close', () => {
              if (!res.writableEnded) res.end()
            })
          })
        },
      },
      '/media': api,
      '/content': api,
      // Sign-in (Google and the test-only dev login) lives outside /api on the server. The object
      // form keeps the browser's Host header (the string shorthand would rewrite it), so the
      // server's same-origin check and Google's return address both see localhost:<web port>.
      '/auth': { target: api },
    },
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    // Libraries (React, the router, motion...) go in their own file. It rarely changes, so the
    // browser keeps it cached across app updates, and neither file gets too big to load quickly.
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'vendor', test: /node_modules/ }] } } },
  },
})
