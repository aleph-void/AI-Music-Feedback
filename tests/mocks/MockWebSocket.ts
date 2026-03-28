/**
 * Reusable WebSocket mock with test helper methods for simulating server events.
 */
export class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  protocols: string[]

  onopen: ((e: Event) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  onclose: ((e: CloseEvent) => void) | null = null

  // Parsed JSON of every message sent via send()
  sent: unknown[] = []

  static lastInstance: MockWebSocket | null = null
  static instances: MockWebSocket[] = []

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = Array.isArray(protocols) ? protocols : protocols ? [protocols] : []
    MockWebSocket.lastInstance = this
    MockWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data))
  }

  close(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ wasClean: true, code, reason } as unknown as CloseEvent)
  }

  // ── Test helpers ────────────────────────────────────────────────────────────

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  simulateMessage(data: object): void {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
  }

  simulateError(): void {
    this.onerror?.(new Event('error'))
  }

  simulateClose(wasClean = true, code = 1000): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ wasClean, code } as unknown as CloseEvent)
  }

  static reset(): void {
    MockWebSocket.instances = []
    MockWebSocket.lastInstance = null
  }
}
