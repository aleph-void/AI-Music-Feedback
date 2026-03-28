import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import vueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html')
        }
      }
    },
    plugins: [
      vue(),
      // Pre-compiles locale JSON files at build time so vue-i18n's runtime-only
      // build can be used — eliminating the need for 'unsafe-eval' in the CSP.
      vueI18nPlugin({
        include: resolve(__dirname, 'src/i18n/*.json')
      })
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        // Use the runtime-only build of vue-i18n (no message compiler bundled).
        // Messages are pre-compiled by the plugin above, so no eval is needed.
        'vue-i18n': 'vue-i18n/dist/vue-i18n.runtime.esm-bundler.js'
      }
    },
    // Copy the audio worklet file as a static asset
    publicDir: resolve(__dirname, 'src/public')
  }
})
