<template>
  <div class="audio-controls">
    <div class="input-section">
      <p class="section-label">{{ t('audioControls.audioSource.sectionLabel') }}</p>
      <div class="source-row">
        <button
          class="refresh-btn"
          @click="refresh"
          :disabled="isCapturing"
          :title="t('audioControls.audioSource.refreshTitle')"
        >
          &#8635;
        </button>
        <select v-model="selectedSourceId" :disabled="isCapturing || sources.length === 0">
          <option value="" disabled>{{ t('audioControls.audioSource.placeholder') }}</option>
          <option v-for="s in sources" :key="s.id" :value="s.id">
            🎤 {{ s.name }}
          </option>
        </select>
      </div>
      <div class="level-row" v-if="isCapturing">
        <div class="level-bar">
          <div class="level-fill" :style="{ width: `${audioLevel * 100}%` }" />
        </div>
        <span class="level-label">{{ t('audioControls.audioSource.levelLabel') }}</span>
      </div>
    </div>

    <div class="input-section">
      <p class="section-label">{{ t('audioControls.voicePrompt.sectionLabel') }}</p>
      <div class="source-row">
        <select v-model="selectedMicId" :disabled="isCapturing || sources.length === 0">
          <option value="">{{ t('audioControls.voicePrompt.noMic') }}</option>
          <option v-for="s in sources" :key="s.id" :value="s.id">
            🎙 {{ s.name }}
          </option>
        </select>
      </div>
      <p class="section-hint">{{ t('audioControls.voicePrompt.hint') }}</p>
      <div class="level-row" v-if="micCapture.isCapturing.value">
        <div class="level-bar">
          <div class="level-fill mic-fill" :style="{ width: `${micLevel * 100}%` }" />
        </div>
        <span class="level-label">{{ t('audioControls.voicePrompt.levelLabel') }}</span>
      </div>
    </div>

    <div v-if="micConflict" class="error-msg">{{ t('audioControls.errors.deviceConflict') }}</div>
    <div v-if="captureError" class="error-msg">{{ captureError }}</div>
    <div v-if="micCapture.captureError.value" class="error-msg">{{ micCapture.captureError.value }}</div>

    <div class="btn-row">
      <button
        v-if="!isCapturing"
        class="start-btn"
        @click="handleStart"
        :disabled="!canStart"
      >
        {{ t('audioControls.startButton') }}
      </button>
      <button
        v-else
        class="stop-btn"
        @click="handleStop"
      >
        {{ t('audioControls.stopButton') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudioCapture } from '@/composables/useAudioCapture'
import { useMicCapture } from '@/composables/useMicCapture'

const props = withDefaults(defineProps<{
  audioTimeout?: number  // seconds; 0 = disabled
  connected?: boolean
}>(), {
  audioTimeout: 0,
  connected: false
})

const emit = defineEmits<{
  chunk: [buffer: ArrayBuffer]
  levelUpdate: [level: number]
  stopped: []
}>()

const { t } = useI18n()
const { sources, isCapturing, captureError, getSources, startCapture, stopCapture } = useAudioCapture()
const micCapture = useMicCapture()
const selectedSourceId = ref('')
const selectedMicId = ref('')
const audioLevel = ref(0)
const micLevel = ref(0)

const micConflict = computed(() =>
  selectedMicId.value !== '' && selectedMicId.value === selectedSourceId.value
)
const canStart = computed(() => props.connected && selectedSourceId.value !== '' && !micConflict.value)

// When the silence timeout fires inside the composable it calls stopCapture()
// directly, bypassing handleStop. Watch isCapturing so the level meter is
// reset and 'stopped' is emitted regardless of what triggered the stop.
watch(isCapturing, (capturing) => {
  if (!capturing) {
    audioLevel.value = 0
    micLevel.value = 0
    micCapture.stopCapture()
    emit('stopped')
  }
})

function onKeyDown(e: KeyboardEvent) {
  if (e.code !== 'Space') return
  const tag = (e.target as HTMLElement).tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return
  e.preventDefault()
  if (isCapturing.value) {
    handleStop()
  } else if (canStart.value) {
    handleStart()
  }
}

onMounted(async () => {
  await getSources()
  if (sources.value.length > 0) {
    selectedSourceId.value = sources.value[0].id
  }
  document.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
})

async function refresh() {
  await getSources()
  if (sources.value.length > 0 && !selectedSourceId.value) {
    selectedSourceId.value = sources.value[0].id
  }
}

async function handleStart() {
  await startCapture(
    selectedSourceId.value,
    (buffer) => emit('chunk', buffer),
    (level) => {
      audioLevel.value = level
      emit('levelUpdate', level)
    },
    props.audioTimeout * 1000
  )
  if (selectedMicId.value) {
    await micCapture.startCapture(
      selectedMicId.value,
      (buffer) => emit('chunk', buffer),
      (level) => { micLevel.value = level }
    )
  }
}

function handleStop() {
  stopCapture()
  // watch(isCapturing) handles mic stop, level reset, and 'stopped' emit
}
</script>

<style scoped>
.audio-controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border);
}

.source-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  min-width: 0;
}

select {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.45rem 0.75rem;
  color: var(--text-primary);
  font-size: 0.88rem;
  outline: none;
  cursor: pointer;
}

select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.refresh-btn {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.45rem 0.6rem;
  cursor: pointer;
  font-size: 1rem;
  color: var(--text-secondary);
  transition: color 0.15s;
}

.refresh-btn:hover:not(:disabled) {
  color: var(--text-primary);
}

.refresh-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.section-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.section-hint {
  font-size: 0.78rem;
  color: var(--text-secondary);
  opacity: 0.75;
  font-style: italic;
}

.mic-fill {
  background: linear-gradient(90deg, #6366f1, #a5b4fc);
}

.error-msg {
  font-size: 0.82rem;
  color: var(--color-error);
  padding: 0.4rem 0.6rem;
  background: color-mix(in srgb, var(--color-error) 12%, transparent);
  border-radius: 5px;
}

.level-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.level-bar {
  flex: 1;
  height: 6px;
  background: var(--bg-input);
  border-radius: 3px;
  overflow: hidden;
}

.level-fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #86efac);
  border-radius: 3px;
  transition: width 0.08s ease-out;
}

.level-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.btn-row {
  display: flex;
  gap: 0.75rem;
}

.start-btn, .stop-btn {
  flex: 1;
  padding: 0.6rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.start-btn {
  background: var(--accent);
  color: white;
}

.start-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.start-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.stop-btn {
  background: var(--color-error);
  color: white;
}

.stop-btn:hover {
  opacity: 0.85;
}
</style>
