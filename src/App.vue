<template>
  <div class="app-shell">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <span class="app-name">{{ t('app.name') }}</span>
        <button
          class="tab-toggle"
          :class="{ active: showSettings }"
          @click="showSettings = !showSettings"
          :title="t('sidebar.settingsTitle')"
        >
          &#9881;
        </button>
      </div>

      <div v-if="showSettings" class="sidebar-content">
        <SettingsPanel />
      </div>

      <div v-else class="sidebar-content sidebar-info">
        <div class="info-block">
          <p class="info-label">{{ t('sidebar.howItWorks') }}</p>
          <ol class="info-steps">
            <li>{{ t('sidebar.steps.1') }}</li>
            <li>{{ t('sidebar.steps.2') }}</li>
            <li>{{ t('sidebar.steps.3') }} <strong>{{ t('sidebar.steps.3action') }}</strong></li>
            <li>{{ t('sidebar.steps.4') }}</li>
          </ol>
        </div>

        <div class="connection-actions">
          <button
            v-if="realtimeApi.status.value === 'disconnected' || realtimeApi.status.value === 'error'"
            class="primary-btn"
            @click="connectToApi"
            :disabled="!settings.apiKey.value"
          >
            {{ t('sidebar.connectButton') }}
          </button>
          <button
            v-else-if="realtimeApi.status.value === 'connected' || realtimeApi.status.value === 'connecting'"
            class="danger-btn"
            @click="realtimeApi.disconnect()"
          >
            {{ t('sidebar.disconnectButton') }}
          </button>
          <p v-if="!settings.apiKey.value" class="key-hint">
            {{ t('sidebar.apiKeyHint') }}
          </p>
        </div>
      </div>

      <AudioControls
        :audio-timeout="settings.audioTimeoutSeconds.value"
        :connected="realtimeApi.status.value === 'connected'"
        @chunk="onAudioChunk"
        @stopped="onCaptureStopped"
      />
    </aside>

    <!-- Main content -->
    <main class="main-content">
      <TranscriptView
        :transcript="realtimeApi.transcript.value"
        @clear="realtimeApi.clearTranscript()"
      />
      <MessageInput
        :connected="realtimeApi.status.value === 'connected'"
        @send="realtimeApi.sendText($event)"
      />
      <StatusBar
        :status="realtimeApi.status.value"
        :status-message="realtimeApi.statusMessage.value"
        :is-capturing="audioCapture.isCapturing.value"
        :can-reconnect="!!settings.apiKey.value"
        @reconnect="connectToApi"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsPanel from '@/components/SettingsPanel.vue'
import AudioControls from '@/components/AudioControls.vue'
import TranscriptView from '@/components/TranscriptView.vue'
import MessageInput from '@/components/MessageInput.vue'
import StatusBar from '@/components/StatusBar.vue'
import { useSettings } from '@/composables/useSettings'
import { useAudioCapture } from '@/composables/useAudioCapture'
import { useRealtimeApi } from '@/composables/useRealtimeApi'

const { t } = useI18n()
const showSettings = ref(false)
const settings = useSettings()
const audioCapture = useAudioCapture()
const realtimeApi = useRealtimeApi()

let cleanupExportListener: (() => void) | undefined

onMounted(async () => {
  await settings.load()
  cleanupExportListener = window.electronAPI?.onMenuExportTranscript(handleExportTranscript)
})

onUnmounted(() => {
  cleanupExportListener?.()
})

function connectToApi() {
  if (!settings.apiKey.value) return
  realtimeApi.connect({
    apiKey: settings.apiKey.value,
    systemPrompt: settings.systemPrompt.value,
    model: settings.model.value,
    outputMode: settings.outputMode.value
  })
}

function onAudioChunk(buffer: ArrayBuffer) {
  realtimeApi.appendAudio(buffer)
}

function onCaptureStopped() {
  // Optionally flush the audio buffer when capture stops
  // The server VAD will handle the final response
}

async function handleExportTranscript() {
  const msgs = realtimeApi.transcript.value
  if (msgs.length === 0) return

  const lines = msgs.map(m => {
    const time = new Date(m.timestamp).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
    const speaker = m.role === 'assistant' ? t('transcript.roles.assistant') : t('transcript.roles.user')
    return `[${time}] ${speaker}:\n${m.content}`
  })
  const content = lines.join('\n\n---\n\n')
  const date = new Date().toISOString().slice(0, 10)

  await window.electronAPI?.exportTranscript(content, `transcript-${date}.txt`)
}
</script>

<style>
/* Global CSS variables */
:root {
  --bg-app: #1a1a2e;
  --bg-sidebar: #16213e;
  --bg-main: #0f3460;
  --bg-input: #1a2744;
  --bg-hover: #1e2f52;
  --bg-message-user: #1e3a5f;
  --bg-message-assistant: #2d1b4e;
  --bg-statusbar: #121229;
  --border: #2a3a5c;
  --accent: #6366f1;
  --text-primary: #e2e8f0;
  --text-secondary: #7a8ba8;
  --color-error: #ef4444;
  --color-warning: #f59e0b;
  --color-success: #22c55e;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
  background: var(--bg-app);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
}

#app {
  height: 100%;
}

button {
  font-family: inherit;
}

::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
</style>

<style scoped>
.app-shell {
  display: flex;
  height: 100%;
}

.sidebar {
  width: 300px;
  flex-shrink: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag; /* macOS draggable titlebar */
  flex-shrink: 0;
}

.app-name {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.tab-toggle {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  font-size: 1rem;
  color: var(--text-secondary);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: all 0.15s;
}

.tab-toggle:hover, .tab-toggle.active {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.sidebar-info {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.info-label {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
}

.info-steps {
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.info-steps li strong {
  color: var(--text-primary);
}

.connection-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.primary-btn, .danger-btn {
  width: 100%;
  padding: 0.6rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.primary-btn {
  background: var(--accent);
  color: white;
}

.primary-btn:hover:not(:disabled) { opacity: 0.85; }
.primary-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.danger-btn {
  background: var(--color-error);
  color: white;
}

.danger-btn:hover { opacity: 0.85; }

.key-hint {
  font-size: 0.78rem;
  color: var(--text-secondary);
  text-align: center;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-main);
  min-width: 0;
}
</style>
