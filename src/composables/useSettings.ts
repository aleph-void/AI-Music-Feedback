import { ref, readonly } from 'vue'

const apiKey = ref('')
const systemPrompt = ref(
  'You are a music production assistant listening to audio in real-time. ' +
  'Provide concise, actionable feedback on what you hear — comment on mix balance, ' +
  'tonality, rhythm, dynamics, or arrangement. Be specific and encouraging.'
)
const storageEncrypted = ref(true)
const isLoaded = ref(false)

export function useSettings() {
  async function load() {
    if (isLoaded.value) return
    const result = await window.electronAPI.loadApiKey()
    if (result.key) {
      apiKey.value = result.key
    }
    storageEncrypted.value = result.encrypted
    isLoaded.value = true
  }

  async function save() {
    await window.electronAPI.saveApiKey(apiKey.value)
  }

  return {
    apiKey,
    systemPrompt,
    storageEncrypted: readonly(storageEncrypted),
    isLoaded: readonly(isLoaded),
    load,
    save
  }
}
