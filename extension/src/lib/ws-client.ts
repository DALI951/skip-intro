const WS_URL = 'ws://127.0.0.1:9876'

export type DesktopStatus = 'connected' | 'disconnected' | 'connecting'

type MessageHandler = (msg: unknown) => void

export class DesktopClient {
  private ws: WebSocket | null = null
  private status: DesktopStatus = 'disconnected'
  private handlers = new Map<string, MessageHandler[]>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  getStatus(): DesktopStatus {
    return this.status
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return
    this.status = 'connecting'
    this.notifyStatus()
    try {
      this.ws = new WebSocket(WS_URL)
      this.ws.onopen = () => {
        this.status = 'connected'
        this.notifyStatus()
      }
      this.ws.onclose = () => {
        this.status = 'disconnected'
        this.notifyStatus()
        this.scheduleReconnect()
      }
      this.ws.onerror = () => {
        this.status = 'disconnected'
        this.notifyStatus()
      }
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const type = (msg as { type: string }).type
          const handlers = this.handlers.get(type) ?? []
          handlers.forEach(h => h(msg))
        } catch { }
      }
    } catch {
      this.status = 'disconnected'
      this.notifyStatus()
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
    this.status = 'disconnected'
    this.notifyStatus()
  }

  send(type: string, payload?: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }))
    }
  }

  on(type: string, handler: MessageHandler): void {
    const existing = this.handlers.get(type) ?? []
    existing.push(handler)
    this.handlers.set(type, existing)
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 5000)
  }

  private notifyStatus(): void {
    chrome.runtime.sendMessage({ type: 'desktop-status', status: this.status }).catch(() => { })
  }
}
