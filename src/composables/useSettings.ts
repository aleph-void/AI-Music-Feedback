import { ref, readonly } from 'vue'
import type { OutputMode, Provider } from '@/types/realtime'

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

const FALLBACK_ANALYSIS_MODELS: RealtimeModel[] = [
  { id: 'gpt-4.1', label: 'gpt-4.1' },
  { id: 'gpt-4o', label: 'gpt-4o (latest)' },
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini' }
]

function modelLabel(id: string): string {
  return /\d{4}-\d{2}-\d{2}$/.test(id) ? id : `${id} (latest)`
}

// ── Module-level state ────────────────────────────────────────────────────────

const provider = ref<Provider>('openai')

// Per-provider credentials
const apiKey = ref('')              // OpenAI API key
const geminiApiKey = ref('')        // Google AI Studio key
const awsAccessKeyId = ref('')
const awsSecretAccessKey = ref('')
const awsSessionToken = ref('')     // optional — for STS/assumed roles
const awsRegion = ref('us-east-1')

// Shared settings
const model = ref(FALLBACK_MODELS[0].id)
const analysisModel = ref(FALLBACK_ANALYSIS_MODELS[0].id)
const analysisWindowSeconds = ref(30)
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
const analysisModels = ref<RealtimeModel[]>(FALLBACK_ANALYSIS_MODELS)
const modelsLoading = ref(false)

// ── Credentials blob (v1) ─────────────────────────────────────────────────────

interface CredentialsBlob {
  v: 1
  provider: Provider
  openaiKey: string
  geminiKey: string
  awsAccessKeyId: string
  awsSecretAccessKey: string
  awsSessionToken: string
  awsRegion: string
  model: string
  analysisModel: string
  analysisWindowSeconds: number
  outputMode: OutputMode
  audioTimeoutSeconds: number
  systemPrompt: string
}

// ── Composable ────────────────────────────────────────────────────────────────

export function useSettings() {
  async function fetchModels() {
    // Only OpenAI exposes a model list endpoint
    if (provider.value !== 'openai') return
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
      const allIds = data.data.map(m => m.id).sort()

      const foundRealtime = allIds
        .filter(id => id.includes('realtime'))
        .map(id => ({ id, label: modelLabel(id) }))
      if (foundRealtime.length > 0) {
        realtimeModels.value = foundRealtime
        if (!foundRealtime.some(m => m.id === model.value)) {
          model.value = foundRealtime[0].id
        }
      }

      const foundAnalysis = allIds
        .filter(id => id.startsWith('gpt-') && !id.includes('realtime') && !id.includes('instruct'))
        .map(id => ({ id, label: modelLabel(id) }))
      if (foundAnalysis.length > 0) {
        analysisModels.value = foundAnalysis
        if (!foundAnalysis.some(m => m.id === analysisModel.value)) {
          analysisModel.value = foundAnalysis[0].id
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
      try {
        const parsed = JSON.parse(result.key)
        if (parsed && typeof parsed === 'object' && parsed.v === 1) {
          const blob = parsed as CredentialsBlob
          provider.value = blob.provider ?? 'openai'
          apiKey.value = (blob.openaiKey ?? '').replace(/\s+/g, '')
          geminiApiKey.value = (blob.geminiKey ?? '').replace(/\s+/g, '')
          awsAccessKeyId.value = (blob.awsAccessKeyId ?? '').replace(/\s+/g, '')
          awsSecretAccessKey.value = (blob.awsSecretAccessKey ?? '').replace(/\s+/g, '')
          awsSessionToken.value = blob.awsSessionToken ?? ''
          awsRegion.value = blob.awsRegion ?? 'us-east-1'
          model.value = blob.model ?? FALLBACK_MODELS[0].id
          analysisModel.value = blob.analysisModel ?? FALLBACK_ANALYSIS_MODELS[0].id
          analysisWindowSeconds.value = Math.min(60, Math.max(20, blob.analysisWindowSeconds ?? 30))
          outputMode.value = blob.outputMode ?? 'text'
          audioTimeoutSeconds.value = blob.audioTimeoutSeconds ?? 5
          systemPrompt.value = blob.systemPrompt ?? systemPrompt.value
        }
      } catch {
        // Legacy: plain OpenAI key stored as raw string
        apiKey.value = result.key.replace(/\s+/g, '')
        provider.value = 'openai'
      }
    }
    storageEncrypted.value = result.encrypted
    isLoaded.value = true
    await fetchModels()
  }

  async function save() {
    apiKey.value = apiKey.value.replace(/\s+/g, '')
    geminiApiKey.value = geminiApiKey.value.replace(/\s+/g, '')
    awsAccessKeyId.value = awsAccessKeyId.value.replace(/\s+/g, '')
    awsSecretAccessKey.value = awsSecretAccessKey.value.replace(/\s+/g, '')
    if (!window.electronAPI) return
    const blob: CredentialsBlob = {
      v: 1,
      provider: provider.value,
      openaiKey: apiKey.value,
      geminiKey: geminiApiKey.value,
      awsAccessKeyId: awsAccessKeyId.value,
      awsSecretAccessKey: awsSecretAccessKey.value,
      awsSessionToken: awsSessionToken.value,
      awsRegion: awsRegion.value,
      model: model.value,
      analysisModel: analysisModel.value,
      analysisWindowSeconds: analysisWindowSeconds.value,
      outputMode: outputMode.value,
      audioTimeoutSeconds: audioTimeoutSeconds.value,
      systemPrompt: systemPrompt.value
    }
    await window.electronAPI.saveApiKey(JSON.stringify(blob))
    await fetchModels()
  }

  return {
    provider,
    apiKey,
    geminiApiKey,
    awsAccessKeyId,
    awsSecretAccessKey,
    awsSessionToken,
    awsRegion,
    model,
    analysisModel,
    analysisWindowSeconds,
    outputMode,
    audioTimeoutSeconds,
    systemPrompt,
    realtimeModels: readonly(realtimeModels),
    analysisModels: readonly(analysisModels),
    modelsLoading: readonly(modelsLoading),
    storageEncrypted: readonly(storageEncrypted),
    isLoaded: readonly(isLoaded),
    load,
    save,
    fetchModels
  }
}
