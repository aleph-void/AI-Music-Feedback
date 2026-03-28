export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface TranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  complete: boolean
  timestamp: number
}

export type OutputMode = 'text' | 'audio'

export interface RealtimeSessionConfig {
  apiKey: string
  systemPrompt: string
  model: string
  outputMode: OutputMode
}

// OpenAI Realtime API server event types
export interface ServerEvent {
  type: string
  event_id?: string
}

export interface SessionCreatedEvent extends ServerEvent {
  type: 'session.created'
  session: { id: string; model: string }
}

export interface ResponseTextDeltaEvent extends ServerEvent {
  type: 'response.text.delta'
  response_id: string
  item_id: string
  delta: string
}

export interface ResponseTextDoneEvent extends ServerEvent {
  type: 'response.text.done'
  response_id: string
  item_id: string
  text: string
}

export interface InputAudioTranscriptionCompletedEvent extends ServerEvent {
  type: 'conversation.item.input_audio_transcription.completed'
  item_id: string
  transcript: string
}

export interface ErrorEvent extends ServerEvent {
  type: 'error'
  error: {
    type: string
    code: string
    message: string
  }
}
