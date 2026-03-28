import { defineConfig, defineProject } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  test: {
    projects: [
      // ── Electron main process (Node environment, no DOM) ───────────────────
      defineProject({
        test: {
          name: 'electron-main',
          environment: 'node',
          include: ['tests/unit/electron/**/*.test.ts'],
          globals: true
        }
      }),

      // ── Renderer + composables + components (happy-dom) ───────────────────
      defineProject({
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
      })
    ]
  }
})
