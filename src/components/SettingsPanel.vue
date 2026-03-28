<template>
  <div class="settings-panel">
    <h2>Settings</h2>

    <div class="field">
      <label for="api-key">OpenAI API Key</label>
      <div class="input-row">
        <input
          id="api-key"
          v-model="settings.apiKey.value"
          :type="showKey ? 'text' : 'password'"
          placeholder="sk-..."
          autocomplete="off"
          spellcheck="false"
        />
        <button class="icon-btn" @click="showKey = !showKey" :title="showKey ? 'Hide' : 'Show'">
          {{ showKey ? '🙈' : '👁' }}
        </button>
      </div>
      <span v-if="!settings.storageEncrypted.value" class="warning">
        ⚠ Encryption unavailable — key stored in plain text
      </span>
    </div>

    <div class="field">
      <label for="system-prompt">System Prompt</label>
      <textarea
        id="system-prompt"
        v-model="settings.systemPrompt.value"
        rows="5"
        placeholder="Describe how you want the AI to give feedback on your music..."
      />
    </div>

    <div class="actions">
      <button class="primary-btn" @click="save" :disabled="saving">
        {{ saving ? 'Saving...' : 'Save Settings' }}
      </button>
      <span v-if="saved" class="saved-msg">Saved!</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSettings } from '@/composables/useSettings'

const settings = useSettings()
const showKey = ref(false)
const saving = ref(false)
const saved = ref(false)

async function save() {
  saving.value = true
  saved.value = false
  await settings.save()
  saving.value = false
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}
</script>

<style scoped>
.settings-panel {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  height: 100%;
  overflow-y: auto;
}

h2 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.input-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

input, textarea {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: monospace;
  outline: none;
  transition: border-color 0.15s;
}

textarea {
  font-family: inherit;
  resize: vertical;
  line-height: 1.5;
}

input:focus, textarea:focus {
  border-color: var(--accent);
}

.icon-btn {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.icon-btn:hover {
  background: var(--bg-hover);
}

.warning {
  font-size: 0.78rem;
  color: var(--color-warning);
}

.actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.primary-btn {
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
}

.primary-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.primary-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.saved-msg {
  font-size: 0.85rem;
  color: var(--color-success);
}
</style>
