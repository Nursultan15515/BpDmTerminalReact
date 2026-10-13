import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Распознавание удостоверения (src/idscan): воркер, ядро WASM и модель tesseract.js отдаём сами, по пути
// /tesseract/ — у терминалов нет интернета, а по умолчанию tesseract.js качает их с CDN. В dev — прямо
// из node_modules, в сборку — копией в dist/tesseract/. Сервер должен отдавать и .gz (модель).
const TESSERACT_FILES: Record<string, string> = {
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  // Воркер сам выбирает ядро: с SIMD или без (на старых процессорах). Скачивается только одно.
  'core/tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'core/tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'lang/eng.traineddata.gz': '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
}

function tesseractAssets(): Plugin {
  let modules = ''
  let base = '/'
  return {
    name: 'tesseract-assets',
    configResolved(config) {
      modules = path.join(config.root, 'node_modules')
      base = config.base
    },
    configureServer(server) {
      server.middlewares.use(`${base}tesseract`, (req, res, next) => {
        const file = TESSERACT_FILES[(req.url ?? '').split('?')[0].replace(/^\//, '')]
        if (!file) return next()
        res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'application/gzip')
        fs.createReadStream(path.join(modules, file)).pipe(res)
      })
    },
    generateBundle() {
      for (const [name, file] of Object.entries(TESSERACT_FILES)) {
        this.emitFile({ type: 'asset', fileName: `tesseract/${name}`, source: fs.readFileSync(path.join(modules, file)) })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tesseractAssets()],
  build: {
    // Терминалы — Windows 7 и Chrome 103 (выше 109 Chrome на Win7 не обновится).
    // По умолчанию Vite собирает под Chrome 111+, поэтому цель задана явно.
    target: 'chrome103',
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5115',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
