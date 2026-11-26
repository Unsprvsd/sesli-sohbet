import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Dev only: the ASCII studio (ascii-studio.html) saves "Final" values here.
 * POST /__studio/final  { id: "seagull", values: { "render.size": 0.06, ... } }
 * -> merged into src/ascii/final.json. Only from this computer (not the network).
 */
function studioSave(): Plugin {
  const file = resolve(__dirname, 'src/ascii/final.json')
  return {
    name: 'ascii-studio-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__studio/final', (req, res) => {
        const ip = req.socket.remoteAddress ?? ''
        const local = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
        if (req.method !== 'POST' || !local) {
          res.statusCode = 403
          res.end('only POST from this computer')
          return
        }
        let body = ''
        req.on('data', (c) => {
          body += c
          if (body.length > 200_000) req.destroy()
        })
        req.on('end', () => {
          try {
            const { id, values } = JSON.parse(body) as { id: string; values: Record<string, unknown> }
            if (!/^[a-z0-9-]{1,40}$/.test(id) || typeof values !== 'object' || !values) throw new Error('bad data')
            const all = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
            all[id] = values
            writeFileSync(file, JSON.stringify(all, null, 2) + '\n')
            res.end('ok')
          } catch (e) {
            res.statusCode = 400
            res.end(String(e))
          }
        })
      })
    },
  }
}

// base './' so the built site works inside a GitHub Pages sub-folder
export default defineConfig({
  base: './',
  plugins: [react(), studioSave()],
})
