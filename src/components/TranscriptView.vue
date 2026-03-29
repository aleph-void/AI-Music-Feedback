<template>
  <div class="transcript-view">
    <div class="transcript-header">
      <span class="title">{{ t('transcript.title') }}</span>
      <div class="header-actions">
        <button
          v-if="transcript.length > 0"
          class="action-btn"
          :class="{ error: copyError }"
          @click="copyTranscript"
          :title="t('transcript.copyTitle')"
        >
          {{ copyError ? t('transcript.copyError') : copied ? t('transcript.copied') : t('transcript.copy') }}
        </button>
        <button
          v-if="transcript.length > 0"
          class="action-btn danger"
          @click="emit('clear')"
          :title="t('transcript.clearTitle')"
        >
          {{ t('transcript.clear') }}
        </button>
      </div>
    </div>

    <div class="messages" ref="messagesEl">
      <div
        v-if="transcript.length === 0"
        class="empty-state"
      >
        <p>{{ t('transcript.emptyState') }}</p>
        <p class="hint">{{ t('transcript.emptyHint') }}</p>
      </div>

      <div
        v-for="msg in transcript"
        :key="msg.id"
        class="message"
        :class="[msg.role, { pending: !msg.complete }]"
      >
        <div class="message-role">
          <template v-if="msg.role === 'analysis'">
            {{ t('transcript.roles.analysis') }}
            <span v-if="!msg.complete" class="analysis-spinner" />
          </template>
          <template v-else>
            {{ msg.role === 'assistant' ? t('transcript.roles.assistant') : t('transcript.roles.user') }}
          </template>
        </div>
        <div class="message-content">
          <template v-if="msg.role === 'analysis' && !msg.complete">
            {{ t('transcript.analysisWorking') }}
          </template>
          <template v-else>{{ msg.content }}</template>
          <span v-if="msg.role !== 'analysis' && !msg.complete" class="cursor" />
        </div>
        <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TranscriptMessage } from '@/types/realtime'

const props = defineProps<{
  transcript: readonly TranscriptMessage[]
}>()

const emit = defineEmits<{
  clear: []
}>()

const { t } = useI18n()
const messagesEl = ref<HTMLElement | null>(null)
const copied = ref(false)
const copyError = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

// Auto-scroll to bottom when transcript changes
watch(
  () => props.transcript.length,
  async () => {
    await nextTick()
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  }
)

// Also scroll on content delta (incomplete messages growing)
watch(
  () => props.transcript.map(m => m.content).join('').length,
  async () => {
    await nextTick()
    if (messagesEl.value) {
      const el = messagesEl.value
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight
      }
    }
  }
)

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

async function copyTranscript() {
  const text = props.transcript
    .map(m => {
      if (m.role === 'analysis') return `[${t('transcript.roles.analysis')}]\n${m.content}`
      return `[${m.role === 'assistant' ? 'AI' : 'You'}] ${m.content}`
    })
    .join('\n\n')
  if (copiedTimer !== null) {
    clearTimeout(copiedTimer)
    copiedTimer = null
  }
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    copyError.value = false
    copiedTimer = setTimeout(() => { copied.value = false; copiedTimer = null }, 2000)
  } catch {
    copyError.value = true
    copiedTimer = setTimeout(() => { copyError.value = false; copiedTimer = null }, 3000)
  }
}
</script>

<style scoped>
.transcript-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.transcript-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem 0.5rem;
  flex-shrink: 0;
}

.title {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 0.25rem 0.6rem;
  font-size: 0.78rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.action-btn.danger:hover {
  border-color: var(--color-error);
  color: var(--color-error);
}

.action-btn.error {
  border-color: var(--color-warning);
  color: var(--color-warning);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  scroll-behavior: smooth;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-secondary);
  gap: 0.5rem;
  padding: 3rem 1rem;
}

.empty-state p {
  margin: 0;
  font-size: 0.95rem;
}

.empty-state .hint {
  font-size: 0.82rem;
  opacity: 0.65;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  max-width: 85%;
  animation: fadeIn 0.2s ease;
}

.message.user {
  align-self: flex-start;
}

.message.assistant {
  align-self: flex-end;
}

.message-role {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.message.assistant .message-role {
  text-align: right;
}

.message-content {
  background: var(--bg-message-user);
  border-radius: 10px;
  padding: 0.6rem 0.9rem;
  font-size: 0.9rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-primary);
}

.message.assistant .message-content {
  background: var(--bg-message-assistant);
}

.message.pending .message-content {
  opacity: 0.85;
}

.cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--accent);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 0.8s step-end infinite;
}

.message-time {
  font-size: 0.7rem;
  color: var(--text-secondary);
  opacity: 0.6;
}

.message.assistant .message-time {
  text-align: right;
}

/* ── Analysis entries ─────────────────────────────────────────────────────── */

.message.analysis {
  align-self: stretch;
  max-width: 100%;
  border-left: 3px solid #0d9488;
  padding-left: 0.75rem;
  opacity: 0.95;
}

.message.analysis .message-role {
  color: #0d9488;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.message.analysis .message-content {
  background: #0a2828;
  border-radius: 6px;
  font-size: 0.88rem;
  white-space: pre-wrap;
}

.message.analysis .message-time {
  text-align: left;
}

.analysis-spinner {
  display: inline-block;
  width: 8px;
  height: 8px;
  border: 1.5px solid #0d9488;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
</style>
