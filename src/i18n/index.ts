import { createI18n } from 'vue-i18n'

type LocaleMessages = Record<string, unknown>

// Auto-discover every *.json file in this directory.
// Adding a new language only requires dropping a new JSON file here.
const modules = import.meta.glob<{ default: LocaleMessages }>('./*.json', { eager: true })

const messages: Record<string, LocaleMessages> = {}
for (const path in modules) {
  const code = path.replace('./', '').replace('.json', '')
  messages[code] = modules[path].default
}

/** All locales derived from the JSON files on disk, sorted by code. */
export const availableLocales: { code: string; name: string }[] = Object.keys(messages)
  .sort()
  .map(code => ({
    code,
    name: (messages[code].language as string) ?? code
  }))

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages
})
