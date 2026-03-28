<template>
  <div class="audio-controls">
    <div class="source-row">
      <button
        class="refresh-btn"
        @click="refresh"
        :disabled="isCapturing"
        title="Refresh sources"
      >
        &#8635;
      </button>
      <select v-model="selectedSourceId" :disabled="isCapturing || sources.length === 0">
        <option value="" disabled>Select audio source...</option>
        <option v-for="s in sources" :key="s.id" :value="s.id">
          {{ s.type === 'screen' ? '🖥' : '🪟' }} {{ s.name }}
        </option>
      </select>
    </div>

    <div v-if="captureError" class="error-msg">{{ captureError }}</div>

    <div class="level-row" v-if="isCapturing">
      <div class="level-bar">
        <div class="level-fill" :style="{ width: `${audioLevel * 100}%` }" />
      </div>
      <span class="level-label">Audio level</span>
    </div>

    <div class="btn-row">
      <button
        v-if="!isCapturing"
        class="start-btn"
        @click="handleStart"
        :disabled="!canStart"
      >
        Start Streaming
      </button>
      <button
        v-else
        class="stop-btn"
        @click="handleStop"
      >
        Stop Streaming
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAudioCapture } from '@/composables/useAudioCapture'

const emit = defineEmits<{
  chunk: [buffer: ArrayBuffer]
  levelUpdate: [level: number]
  stopped: []
}>()

const { sources, isCapturing, captureError, getSources, startCapture, stopCapture } = useAudioCapture()
const selectedSourceId = ref('')
const audioLevel = ref(0)

const canStart = computed(() => selectedSourceId.value !== '')

onMounted(async () => {
  await getSources()
  if (sources.value.length > 0) {
    selectedSourceId.value = sources.value[0].id
  }
})

async function refresh() {
  await getSources()
  if (sources.value.length > 0 && !selectedSourceId.value) {
    selectedSourceId.value = sources.value[0].id
  }
}

async function handleStart() {
  await startCapture(
    (buffer) => emit('chunk', buffer),
    (level) => {
      audioLevel.value = level
      emit('levelUpdate', level)
    }
  )
}

function handleStop() {
  stopCapture()
  audioLevel.value = 0
  emit('stopped')
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
}

select {
  flex: 1;
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
