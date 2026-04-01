<template>
  <div class="status-bar">
    <div class="status-left">
      <span class="status-dot" :class="status" />
      <span class="status-text">{{ statusMessage || statusLabel }}</span>
    </div>
    <div class="status-right">
      <span v-if="isCapturing" class="recording-badge">
        &#9679; {{ t('statusBar.streaming') }}
      </span>
      <button
        v-if="status === 'error' || status === 'disconnected'"
        class="reconnect-btn"
        @click="onReconnect"
        :disabled="!canReconnect || reconnecting"
      >
        {{ t('statusBar.reconnect') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ConnectionStatus } from '@/types/realtime'

const props = defineProps<{
  status: ConnectionStatus
  statusMessage: string
  isCapturing: boolean
  canReconnect: boolean
}>()

const emit = defineEmits<{
  reconnect: []
}>()

const { t } = useI18n()

const reconnecting = ref(false)

function onReconnect() {
  if (reconnecting.value) return
  reconnecting.value = true
  emit('reconnect')
  setTimeout(() => { reconnecting.value = false }, 2000)
}

const statusLabel = computed(() => {
  switch (props.status) {
    case 'connected': return t('statusBar.status.connected')
    case 'connecting': return t('statusBar.status.connecting')
    case 'error': return t('statusBar.status.error')
    default: return t('statusBar.status.disconnected')
  }
})
</script>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.35rem 1rem;
  background: var(--bg-statusbar);
  border-top: 1px solid var(--border);
  font-size: 0.78rem;
  flex-shrink: 0;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.disconnected { background: var(--text-secondary); }
.status-dot.connecting   { background: var(--color-warning); animation: pulse 1s ease-in-out infinite; }
.status-dot.connected    { background: var(--color-success); }
.status-dot.error        { background: var(--color-error); }

.status-text {
  color: var(--text-secondary);
}

.status-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.recording-badge {
  color: var(--color-recording);
  font-weight: 500;
  animation: pulse 1.5s ease-in-out infinite;
}

.reconnect-btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.15rem 0.5rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.reconnect-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.reconnect-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
</style>
