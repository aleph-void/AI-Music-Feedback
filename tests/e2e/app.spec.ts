/**
 * End-to-end tests for AI Streamer using Playwright + Electron.
 *
 * Prerequisites:
 *   npm run build   — must be run before these tests
 *
 * Run with:
 *   npm run test:e2e
 */
import { test, expect, _electron as electron } from '@playwright/test'
import { resolve } from 'path'
import type { ElectronApplication, Page } from '@playwright/test'

const MAIN_PATH = resolve(__dirname, '../../out/main/index.js')

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  app = await electron.launch({
    args: [MAIN_PATH],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      // Suppress GPU errors in CI
      ELECTRON_DISABLE_SANDBOX: '1'
    }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterEach(async () => {
  await app.close()
})

// ── Window ─────────────────────────────────────────────────────────────────

test('window opens successfully', async () => {
  expect(page).toBeTruthy()
})

test('window title is "AI Streamer"', async () => {
  expect(await page.title()).toBe('AI Streamer')
})

// ── Sidebar ────────────────────────────────────────────────────────────────

test('displays "AI Streamer" in the sidebar header', async () => {
  await expect(page.locator('.app-name')).toHaveText('AI Streamer')
})

test('sidebar shows the info panel by default', async () => {
  await expect(page.locator('.sidebar-info')).toBeVisible()
  await expect(page.locator('.settings-panel')).not.toBeVisible()
})

test('info panel contains 4 numbered steps', async () => {
  const items = page.locator('.info-steps li')
  await expect(items).toHaveCount(4)
})

// ── Settings panel toggle ──────────────────────────────────────────────────

test('clicking the gear button reveals the settings panel', async () => {
  await page.locator('.tab-toggle').click()
  await expect(page.locator('.settings-panel')).toBeVisible()
})

test('clicking the gear button again hides the settings panel', async () => {
  await page.locator('.tab-toggle').click()
  await page.locator('.tab-toggle').click()
  await expect(page.locator('.settings-panel')).not.toBeVisible()
})

test('gear button has the "active" class while settings are open', async () => {
  await page.locator('.tab-toggle').click()
  await expect(page.locator('.tab-toggle')).toHaveClass(/active/)
})

// ── API key input ──────────────────────────────────────────────────────────

test('API key input is masked (type=password) by default', async () => {
  await page.locator('.tab-toggle').click()
  await expect(page.locator('#api-key')).toHaveAttribute('type', 'password')
})

test('clicking the show/hide button reveals the API key', async () => {
  await page.locator('.tab-toggle').click()
  await page.locator('.icon-btn').click()
  await expect(page.locator('#api-key')).toHaveAttribute('type', 'text')
})

test('clicking show/hide again masks the API key', async () => {
  await page.locator('.tab-toggle').click()
  await page.locator('.icon-btn').click()
  await page.locator('.icon-btn').click()
  await expect(page.locator('#api-key')).toHaveAttribute('type', 'password')
})

test('system prompt textarea is present and editable', async () => {
  await page.locator('.tab-toggle').click()
  await expect(page.locator('#system-prompt')).toBeVisible()
  await page.locator('#system-prompt').fill('Feedback on my jazz track')
  await expect(page.locator('#system-prompt')).toHaveValue('Feedback on my jazz track')
})

// ── Connection controls ────────────────────────────────────────────────────

test('Connect button is disabled without an API key', async () => {
  const connectBtn = page.locator('.connection-actions .primary-btn')
  await expect(connectBtn).toBeDisabled()
})

test('Connect button is enabled after entering an API key', async () => {
  await page.locator('.tab-toggle').click()
  await page.locator('#api-key').fill('sk-test1234567890')
  await page.locator('.tab-toggle').click()
  const connectBtn = page.locator('.connection-actions .primary-btn')
  await expect(connectBtn).toBeEnabled()
})

test('API key hint is shown when no key is set', async () => {
  await expect(page.locator('.key-hint')).toBeVisible()
})

// ── Status bar ─────────────────────────────────────────────────────────────

test('status bar shows disconnected state on launch', async () => {
  await expect(page.locator('.status-dot')).toHaveClass(/disconnected/)
})

test('Reconnect button is present in disconnected state', async () => {
  await expect(page.locator('.reconnect-btn')).toBeVisible()
})

// ── Transcript area ────────────────────────────────────────────────────────

test('transcript shows empty state initially', async () => {
  await expect(page.locator('.empty-state')).toBeVisible()
})

test('empty state mentions streaming', async () => {
  await expect(page.locator('.empty-state')).toContainText('streaming')
})

// ── Audio controls ─────────────────────────────────────────────────────────

test('audio source refresh button is visible', async () => {
  await expect(page.locator('.refresh-btn')).toBeVisible()
})

test('Start Streaming button is visible', async () => {
  await expect(page.locator('.start-btn')).toBeVisible()
})
