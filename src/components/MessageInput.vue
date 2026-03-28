<template>
  <div class="message-input">
    <textarea
      v-model="text"
      class="message-textarea"
      :placeholder="t('messageInput.placeholder')"
      :disabled="!connected"
      rows="1"
      @keydown.enter.exact.prevent="submit"
      @keydown.shift.enter.exact="autoResize"
      @input="autoResize"
      ref="textareaEl"
    />
    <button class="send-btn" :disabled="!canSend" @click="submit" :title="t('messageInput.sendTitle')">
      &#9658;
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ connected: boolean }>()
const emit = defineEmits<{ send: [text: string] }>()

const { t } = useI18n()
const text = ref('')
const textareaEl = ref<HTMLTextAreaElement | null>(null)

const canSend = computed(() => props.connected && text.value.trim().length > 0)

function submit() {
  if (!canSend.value) return
  emit('send', text.value)
  text.value = ''
  if (textareaEl.value) {
    textareaEl.value.style.height = 'auto'
  }
}

function autoResize() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
</script>

<style scoped>
.message-input {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-top: 1px solid var(--border);
  background: var(--bg-main);
}

.message-textarea {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  line-height: 1.5;
  resize: none;
  outline: none;
  max-height: 8rem;
  overflow-y: auto;
  transition: border-color 0.15s;
}

.message-textarea:focus {
  border-color: var(--accent);
}

.message-textarea:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.send-btn {
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  width: 2.25rem;
  height: 2.25rem;
  font-size: 0.95rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: opacity 0.15s;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.send-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
