import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function writeVersionPlugin() {
  return {
    name: 'write-version',
    buildStart() {
      const publicDir = path.resolve(__dirname, 'public')
      if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })
      fs.writeFileSync(
        path.join(publicDir, 'version.json'),
        JSON.stringify({ v: Date.now() })
      )
    }
  }
}

export default defineConfig({
  plugins: [react(), writeVersionPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
