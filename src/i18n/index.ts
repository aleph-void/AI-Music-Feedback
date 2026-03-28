import { createI18n } from 'vue-i18n'

type LocaleMessages = Record<string, unknown>

// Compiled messages for vue-i18n (processed by @intlify/unplugin-vue-i18n).
// After compilation, string values become message functions — not plain strings.
const modules = import.meta.glob<{ default: LocaleMessages }>('./*.json', { eager: true })

// Raw JSON strings for extracting locale metadata (language display names).
// The ?raw query bypasses the vue-i18n compiler so values stay as plain strings.
const rawModules = import.meta.glob<string>('./*.json', { eager: true, query: '?raw', import: 'default' })

const messages: Record<string, LocaleMessages> = {}
for (const path in modules) {
  const code = path.replace('./', '').replace('.json', '')
  messages[code] = modules[path].default
}

/** All locales derived from the JSON files on disk, sorted by code. */
export const availableLocales: { code: string; name: string }[] = Object.keys(messages)
  .sort()
  .map(code => {
    const raw = JSON.parse(rawModules[`./${code}.json`] ?? '{}')
    return { code, name: (raw.language as string) ?? code }
  })

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages
})
