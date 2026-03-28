import { defineWorkspace } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineWorkspace([
  // ── Electron main process (Node environment, no DOM) ─────────────────────
  {
    test: {
      name: 'electron-main',
      environment: 'node',
      include: ['tests/unit/electron/**/*.test.ts'],
      globals: true
    }
  },

  // ── Renderer + composables + components (happy-dom) ──────────────────────
  {
    plugins: [vue()],
    resolve: {
      alias: { '@': resolve(__dirname, 'src') }
    },
    test: {
      name: 'renderer',
      environment: 'happy-dom',
      include: [
        'tests/unit/composables/**/*.test.ts',
        'tests/unit/worklet/**/*.test.js',
        'tests/component/**/*.test.ts'
      ],
      globals: true,
      setupFiles: ['tests/setup.ts']
    }
  }
])
