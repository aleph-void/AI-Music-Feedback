<template>
  <div class="settings-panel">
    <h2>{{ t('settings.title') }}</h2>

    <!-- Provider selector -->
    <div class="field">
      <label for="provider">{{ t('settings.provider.label') }}</label>
      <select id="provider" v-model="settings.provider.value">
        <option value="openai">{{ t('settings.provider.openai') }}</option>
        <option value="gemini">{{ t('settings.provider.gemini') }}</option>
        <option value="nova-sonic">{{ t('settings.provider.novaSonic') }}</option>
      </select>
    </div>

    <!-- OpenAI credentials -->
    <template v-if="settings.provider.value === 'openai'">
      <div class="field">
        <label for="api-key">{{ t('settings.apiKey.label') }}</label>
        <div class="input-row">
          <input
            id="api-key"
            v-model="settings.apiKey.value"
            :type="showApiKey ? 'text' : 'password'"
            :placeholder="t('settings.apiKey.placeholder')"
            autocomplete="off"
            spellcheck="false"
          />
          <button
            class="icon-btn api-key-toggle"
            @click="showApiKey = !showApiKey"
            :title="showApiKey ? t('settings.apiKey.hide') : t('settings.apiKey.show')"
          >
            {{ showApiKey ? '🙈' : '👁' }}
          </button>
        </div>
        <span v-if="openaiKeyFormatError" class="warning">⚠ {{ openaiKeyFormatError }}</span>
        <span v-else-if="!settings.storageEncrypted.value" class="warning">
          ⚠ {{ t('settings.apiKey.encryptionWarning') }}
        </span>
      </div>

      <div class="field">
        <div class="label-row">
          <label for="model">{{ t('settings.model.label') }}</label>
          <button
            class="icon-btn"
            @click="settings.fetchModels()"
            :disabled="settings.modelsLoading.value || !settings.apiKey.value"
            :title="t('settings.model.refreshTitle')"
          >{{ settings.modelsLoading.value ? '…' : '↻' }}</button>
        </div>
        <select id="model" v-model="settings.model.value" :disabled="settings.modelsLoading.value">
          <option v-for="m in settings.realtimeModels.value" :key="m.id" :value="m.id">
            {{ m.label }}
          </option>
        </select>
      </div>
    </template>

    <!-- Gemini credentials -->
    <template v-else-if="settings.provider.value === 'gemini'">
      <div class="field">
        <label for="gemini-key">{{ t('settings.geminiKey.label') }}</label>
        <div class="input-row">
          <input
            id="gemini-key"
            v-model="settings.geminiApiKey.value"
            :type="showGeminiKey ? 'text' : 'password'"
            :placeholder="t('settings.geminiKey.placeholder')"
            autocomplete="off"
            spellcheck="false"
          />
          <button
            class="icon-btn gemini-key-toggle"
            @click="showGeminiKey = !showGeminiKey"
            :title="showGeminiKey ? t('settings.geminiKey.hide') : t('settings.geminiKey.show')"
          >
            {{ showGeminiKey ? '🙈' : '👁' }}
          </button>
        </div>
        <span v-if="!settings.storageEncrypted.value" class="warning">
          ⚠ {{ t('settings.apiKey.encryptionWarning') }}
        </span>
      </div>
    </template>

    <!-- Amazon Nova Sonic credentials -->
    <template v-else-if="settings.provider.value === 'nova-sonic'">
      <div class="field">
        <label for="aws-access-key-id">{{ t('settings.aws.accessKeyId.label') }}</label>
        <input
          id="aws-access-key-id"
          v-model="settings.awsAccessKeyId.value"
          type="password"
          :placeholder="t('settings.aws.accessKeyId.placeholder')"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <div class="field">
        <label for="aws-secret-key">{{ t('settings.aws.secretAccessKey.label') }}</label>
        <input
          id="aws-secret-key"
          v-model="settings.awsSecretAccessKey.value"
          type="password"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <div class="field">
        <label for="aws-session-token">{{ t('settings.aws.sessionToken.label') }}</label>
        <input
          id="aws-session-token"
          v-model="settings.awsSessionToken.value"
          type="password"
          :placeholder="t('settings.aws.sessionToken.placeholder')"
          autocomplete="off"
          spellcheck="false"
        />
        <span class="hint">{{ t('settings.aws.sessionToken.hint') }}</span>
      </div>
      <div class="field">
        <label for="aws-region">{{ t('settings.aws.region.label') }}</label>
        <input
          id="aws-region"
          v-model="settings.awsRegion.value"
          type="text"
          :placeholder="t('settings.aws.region.placeholder')"
        />
      </div>
    </template>

    <!-- Output mode — all providers -->
    <div class="field">
      <label>{{ t('settings.outputMode.label') }}</label>
      <div class="mode-toggle">
        <button
          class="mode-btn"
          :class="{ active: settings.outputMode.value === 'text' }"
          @click="settings.outputMode.value = 'text'"
        >{{ t('settings.outputMode.text') }}</button>
        <button
          class="mode-btn"
          :class="{ active: settings.outputMode.value === 'audio' }"
          @click="settings.outputMode.value = 'audio'"
        >{{ t('settings.outputMode.audio') }}</button>
      </div>
      <div v-if="settings.outputMode.value === 'audio'" class="audio-warning">
        {{ t('settings.outputMode.audioWarning') }}
      </div>
    </div>

    <div class="field">
      <label for="audio-timeout">{{ t('settings.silenceTimeout.label') }}</label>
      <input
        id="audio-timeout"
        v-model.number="settings.audioTimeoutSeconds.value"
        type="number"
        min="1"
        step="1"
      />
      <span class="hint">{{ t('settings.silenceTimeout.hint') }}</span>
    </div>

    <div class="field">
      <div class="label-row">
        <label for="system-prompt">{{ t('settings.systemPrompt.label') }}</label>
        <span
          class="char-count"
          :class="{ warn: settings.systemPrompt.value.length > 3000, over: settings.systemPrompt.value.length > 4000 }"
        >{{ settings.systemPrompt.value.length }} / 4000</span>
      </div>
      <textarea
        id="system-prompt"
        v-model="settings.systemPrompt.value"
        rows="5"
        :placeholder="t('settings.systemPrompt.placeholder')"
      />
      <span v-if="settings.systemPrompt.value.length > 4000" class="warning">
        ⚠ {{ t('settings.systemPrompt.tooLong') }}
      </span>
    </div>

    <div class="field">
      <label for="language">{{ t('settings.language.label') }}</label>
      <select id="language" v-model="locale">
        <option v-for="lang in availableLocales" :key="lang.code" :value="lang.code">
          {{ lang.name }}
        </option>
      </select>
    </div>

    <div class="actions">
      <button class="primary-btn" @click="save" :disabled="saving">
        {{ saving ? t('settings.savingButton') : t('settings.saveButton') }}
      </button>
      <span v-if="saved" class="saved-msg">{{ t('settings.savedMessage') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettings } from '@/composables/useSettings'
import { availableLocales } from '@/i18n'

const { t, locale } = useI18n({ useScope: 'global' })
const settings = useSettings()
const showApiKey = ref(false)
const showGeminiKey = ref(false)
const saving = ref(false)
const saved = ref(false)

const openaiKeyFormatError = computed(() => {
  if (settings.provider.value !== 'openai') return null
  const k = settings.apiKey.value.replace(/\s+/g, '')
  if (!k) return null
  if (!k.startsWith('sk-')) return t('settings.apiKey.formatError')
  return null
})

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

.label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

select {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  color: var(--text-primary);
  font-size: 0.9rem;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

select:focus {
  border-color: var(--accent);
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

.hint {
  font-size: 0.78rem;
  color: var(--text-secondary);
}

.char-count {
  font-size: 0.72rem;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.char-count.warn {
  color: var(--color-warning);
}

.char-count.over {
  color: var(--color-error);
  font-weight: 600;
}

.warning {
  font-size: 0.78rem;
  color: var(--color-warning);
}

.mode-toggle {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.mode-btn {
  flex: 1;
  padding: 0.45rem 0;
  background: var(--bg-input);
  border: none;
  color: var(--text-secondary);
  font-size: 0.88rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.mode-btn:first-child {
  border-right: 1px solid var(--border);
}

.mode-btn.active {
  background: var(--accent);
  color: white;
}

.audio-warning {
  font-size: 0.78rem;
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  border-radius: 5px;
  padding: 0.4rem 0.6rem;
  line-height: 1.4;
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
