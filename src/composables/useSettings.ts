import { ref, readonly } from 'vue'
import type { OutputMode } from '@/types/realtime'

export interface RealtimeModel {
  id: string
  label: string
}

const FALLBACK_MODELS: RealtimeModel[] = [
  { id: 'gpt-realtime-1.5', label: 'gpt-realtime-1.5' },
  { id: 'gpt-4o-realtime-preview', label: 'gpt-4o-realtime-preview (latest)' },
  { id: 'gpt-4o-mini-realtime-preview', label: 'gpt-4o-mini-realtime-preview (latest)' },
  { id: 'gpt-4o-realtime-preview-2024-12-17', label: 'gpt-4o-realtime-preview-2024-12-17' },
  { id: 'gpt-4o-mini-realtime-preview-2024-12-17', label: 'gpt-4o-mini-realtime-preview-2024-12-17' }
]

function modelLabel(id: string): string {
  // IDs ending with a date are pinned versions; all others are "latest" aliases
  return /\d{4}-\d{2}-\d{2}$/.test(id) ? id : `${id} (latest)`
}

const apiKey = ref('')
const model = ref(FALLBACK_MODELS[0].id)
const outputMode = ref<OutputMode>('text')
const audioTimeoutSeconds = ref(5)
const systemPrompt = ref(
  'You are a music production assistant listening to audio in real-time. ' +
  'Provide concise, actionable feedback on what you hear — comment on mix balance, ' +
  'tonality, rhythm, dynamics, or arrangement. Be specific and encouraging.'
)
const storageEncrypted = ref(true)
const isLoaded = ref(false)
const realtimeModels = ref<RealtimeModel[]>(FALLBACK_MODELS)
const modelsLoading = ref(false)

export function useSettings() {
  async function fetchModels() {
    const key = apiKey.value.replace(/\s+/g, '')
    if (!key) return
    modelsLoading.value = true
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` }
      })
      if (!res.ok) return
      const data = await res.json() as { data?: { id: string }[] }
      if (!Array.isArray(data.data)) return
      const found = data.data
        .map(m => m.id)
        .filter(id => id.includes('realtime'))
        .sort()
        .map(id => ({ id, label: modelLabel(id) }))
      if (found.length > 0) {
        realtimeModels.value = found
        // If the currently selected model is no longer in the list, reset to first
        if (!found.some(m => m.id === model.value)) {
          model.value = found[0].id
        }
      }
    } catch {
      // Network or parse error — keep existing model list
    } finally {
      modelsLoading.value = false
    }
  }

  async function load() {
    if (isLoaded.value) return
    if (!window.electronAPI) return
    const result = await window.electronAPI.loadApiKey()
    if (result.key) {
      apiKey.value = result.key.replace(/\s+/g, '')
    }
    storageEncrypted.value = result.encrypted
    isLoaded.value = true
    await fetchModels()
  }

  async function save() {
    apiKey.value = apiKey.value.replace(/\s+/g, '')
    if (!window.electronAPI) return
    await window.electronAPI.saveApiKey(apiKey.value)
    await fetchModels()
  }

  return {
    apiKey,
    model,
    outputMode,
    audioTimeoutSeconds,
    systemPrompt,
    realtimeModels: readonly(realtimeModels),
    modelsLoading: readonly(modelsLoading),
    storageEncrypted: readonly(storageEncrypted),
    isLoaded: readonly(isLoaded),
    load,
    save,
    fetchModels
  }
}
