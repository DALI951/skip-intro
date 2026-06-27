import { useState, useEffect } from 'react'
import type { Config } from '@skip-intro/core'

const PAGES = ['settings', 'videos', 'shows', 'debug'] as const
type Page = typeof PAGES[number]

const KEY_LABELS: Record<string, string> = {
  s: 'S', m: 'M', n: 'N', k: 'K', space: 'Space',
  a: 'A', b: 'B', c: 'C', d: 'D', f: 'F', g: 'G', h: 'H',
  p: 'P', q: 'Q', r: 'R', t: 'T', u: 'U', v: 'V', x: 'X', z: 'Z',
}

export default function App() {
  const [page, setPage] = useState<Page>('settings')
  const [config, setConfig] = useState<Config | null>(null)
  const [desktopStatus, setDesktopStatus] = useState('connecting')

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'get-config' }, (c: Config) => setConfig(c))
    chrome.runtime.sendMessage({ type: 'desktop-status' }, (res: { status: string }) => setDesktopStatus(res.status))
  }, [])

  if (!config) return <div style={styles.loading}>Loading...</div>

  const sidebarItems: { id: Page; label: string; icon: string }[] = [
    { id: 'settings', label: 'Settings', icon: '⚙' },
    { id: 'videos', label: 'Videos', icon: '🎬' },
    { id: 'shows', label: 'Shows', icon: '📺' },
    { id: 'debug', label: 'Debug', icon: '🔍' },
  ]

  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <div style={styles.logo}>SI</div>
        {sidebarItems.map(item => (
          <div
            key={item.id}
            style={{ ...styles.sidebarItem, ...(page === item.id ? styles.sidebarItemActive : {}) }}
            onClick={() => setPage(item.id)}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
        <div style={styles.statusBar}>
          <span style={{ ...styles.dot, background: desktopStatus === 'connected' ? '#34d399' : '#6b7280' }} />
          <span style={styles.statusText}>
            {desktopStatus === 'connected' ? 'Desktop connected' : 'Desktop offline'}
          </span>
        </div>
      </div>
      <div style={styles.content}>
        {page === 'settings' && <SettingsPage config={config} onConfigChange={setConfig} />}
        {page === 'videos' && <VideosPage />}
        {page === 'shows' && <ShowsPage />}
        {page === 'debug' && <DebugPage />}
      </div>
    </div>
  )
}

function SettingsPage({ config, onConfigChange }: { config: Config; onConfigChange: (c: Config) => void }) {
  const update = (partial: Partial<Config>) => {
    const next = { ...config, ...partial }
    onConfigChange(next)
    chrome.runtime.sendMessage({ type: 'save-config', config: next })
  }

  const updateShortcut = (key: 'skip' | 'markStart' | 'markEnd', value: string) => {
    update({ shortcuts: { ...config.shortcuts, [key]: value } })
  }

  return (
    <div>
      <h2 style={styles.heading}>Settings</h2>

      <div style={styles.section}>
        <label style={styles.label}>Skip Mode</label>
        <select
          value={config.skipMode}
          onChange={e => update({ skipMode: e.target.value as Config['skipMode'] })}
          style={styles.select}
        >
          <option value="overlay">Overlay button (click to skip)</option>
          <option value="auto">Auto-skip (with countdown)</option>
          <option value="off">Off</option>
        </select>
      </div>

      <div style={styles.section}>
        <label style={styles.label}>Countdown Duration (seconds)</label>
        <select
          value={config.countdownSec}
          onChange={e => update({ countdownSec: parseInt(e.target.value) })}
          style={styles.select}
        >
          <option value={3}>3 seconds</option>
          <option value={5}>5 seconds</option>
          <option value={10}>10 seconds</option>
        </select>
      </div>

      <div style={styles.section}>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={config.keyboardShortcuts}
            onChange={e => update({ keyboardShortcuts: e.target.checked })}
            style={styles.checkbox}
          />
          Enable keyboard shortcuts
        </label>
      </div>

      {config.keyboardShortcuts && (
        <div style={styles.shortcutsBox}>
          <label style={styles.label}>Shortcut Keys</label>
          {(['skip', 'markStart', 'markEnd'] as const).map(action => (
            <div key={action} style={styles.shortcutRow}>
              <span style={styles.shortcutLabel}>
                {action === 'skip' ? 'Skip' : action === 'markStart' ? 'Mark Start' : 'Mark End'}
              </span>
              <select
                value={config.shortcuts[action]}
                onChange={e => updateShortcut(action, e.target.value)}
                style={styles.keySelect}
              >
                {Object.entries(KEY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div style={styles.section}>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={config.desktopEnabled}
            onChange={e => update({ desktopEnabled: e.target.checked })}
            style={styles.checkbox}
          />
          Connect to SkipIntro Desktop (for audio fingerprinting)
        </label>
      </div>

      <div style={styles.section}>
        <button onClick={exportData} style={styles.button}>Export Data</button>
        <button onClick={importData} style={{ ...styles.button, ...styles.buttonSecondary }}>Import Data</button>
      </div>
    </div>
  )
}

function ShowsPage() {
  const [shows, setShows] = useState<string[]>([])
  const [newShow, setNewShow] = useState('')

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'get-shows' }, (s: string[]) => setShows(s))
  }, [])

  const addShow = () => {
    if (!newShow.trim()) return
    chrome.runtime.sendMessage({ type: 'add-show', name: newShow.trim() }, () => {
      setShows([...shows, newShow.trim()])
      setNewShow('')
    })
  }

  return (
    <div>
      <h2 style={styles.heading}>Shows</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={newShow}
          onChange={e => setNewShow(e.target.value)}
          placeholder="Add a show..."
          style={styles.input}
          onKeyDown={e => e.key === 'Enter' && addShow()}
        />
        <button onClick={addShow} style={styles.button}>Add</button>
      </div>
      {shows.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 14 }}>No shows yet. Start watching something and mark an intro!</p>
      ) : (
        shows.map(s => (
          <div key={s} style={styles.showItem}>
            <span>{s}</span>
          </div>
        ))
      )}
    </div>
  )
}

interface VideoEntry {
  index: number
  src: string
  width: number
  height: number
  currentTime: number
  duration: number
  isSelected: boolean
}

async function sendToTab<T>(tabId: number, msg: Record<string, unknown>): Promise<T | null> {
  try {
    return await chrome.tabs.sendMessage<T>(tabId, msg)
  } catch {
    return null
  }
}

async function ensureContentScript(tabId: number): Promise<boolean> {
  const result = await sendToTab(tabId, { type: 'ping' })
  if (result !== null) return true
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    })
    await new Promise(r => setTimeout(r, 200))
    return true
  } catch {
    return false
  }
}

function VideosPage() {
  const [videos, setVideos] = useState<VideoEntry[]>([])
  const [tabId, setTabId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [noInject, setNoInject] = useState(false)

  const fetchVideos = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const id = tabs[0]?.id ?? null
    setTabId(id)
    if (!id) { setLoading(false); return }
    const loaded = await ensureContentScript(id)
    if (!loaded) { setNoInject(true); setLoading(false); return }
    const result = await sendToTab<VideoEntry[]>(id, { type: 'get-videos' })
    if (result) setVideos(result)
    setLoading(false)
  }

  useEffect(() => {
    fetchVideos()
    const handler = (msg: { type: string; index?: number }) => {
      if (msg.type === 'video-picked' && typeof msg.index === 'number') {
        setPicking(false)
        setVideos(prev => prev.map(v => ({ ...v, isSelected: v.index === msg.index! })))
      }
    }
    chrome.runtime.onMessage.addListener(handler)
    return () => chrome.runtime.onMessage.removeListener(handler)
  }, [])

  useEffect(() => {
    if (!picking || tabId === null) return
    sendToTab(tabId, { type: 'start-picker' })
    return () => { if (tabId) sendToTab(tabId, { type: 'stop-picker' }) }
  }, [picking, tabId])

  const selectVideo = async (index: number) => {
    if (tabId === null) return
    await sendToTab(tabId, { type: 'select-video', index })
    setVideos(videos.map(v => ({ ...v, isSelected: v.index === index })))
  }

  return (
    <div>
      <h2 style={styles.heading}>Videos on Page</h2>
      {loading ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>Scanning page...</p>
      ) : noInject ? (
        <div>
          <p style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>
            Could not inject SkipIntro into this page. Try refreshing the tab.
          </p>
          <button onClick={fetchVideos} style={styles.button}>Retry</button>
        </div>
      ) : picking ? (
        <div>
          <p style={{ color: '#a78bfa', fontSize: 13, marginBottom: 12 }}>
            ✓ Picker active — hover over videos on the page, then click one to select it.
          </p>
          <p style={{ color: '#6b7280', fontSize: 12, marginBottom: 12 }}>
            Press Escape or click Cancel to stop.
          </p>
          <button onClick={() => setPicking(false)} style={{ ...styles.button, ...styles.buttonSecondary }}>
            Cancel
          </button>
        </div>
      ) : videos.length === 0 ? (
        <div>
          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 12 }}>
            No videos detected. Try one of the options below:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => setPicking(true)} style={styles.button}>
              Pick Video from Page
            </button>
            <button onClick={fetchVideos} style={{ ...styles.button, ...styles.buttonSecondary }}>
              Refresh
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={() => setPicking(true)} style={styles.button}>
              Pick Video from Page
            </button>
            <button onClick={fetchVideos} style={{ ...styles.button, ...styles.buttonSecondary }}>
              Refresh
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
            {videos.length} video{videos.length > 1 ? 's' : ''} found — click to select which to track:
          </p>
          {videos.map(v => (
            <div
              key={v.index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                marginBottom: 6,
                background: v.isSelected ? 'rgba(167,139,250,0.15)' : '#1a1a2e',
                border: v.isSelected ? '1px solid #a78bfa' : '1px solid #2d2d44',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                transition: 'all 0.15s',
              }}
              onClick={() => selectVideo(v.index)}
            >
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                background: v.isSelected ? '#a78bfa' : '#2d2d44',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 11,
                color: v.isSelected ? '#0f0f1a' : '#9ca3af',
                flexShrink: 0,
              }}>
                {v.index + 1}
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ color: '#e2e8f0', fontWeight: v.isSelected ? 600 : 400, marginBottom: 2 }}>
                  Video #{v.index + 1}
                  {v.isSelected && <span style={{ color: '#a78bfa', marginLeft: 6 }}>✓ tracked</span>}
                </div>
                <div style={{ color: '#6b7280', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.width}×{v.height} · {v.src ? v.src.slice(0, 100) : 'no source'}
                </div>
              </div>
              <span style={{ color: '#6b7280', fontSize: 11, whiteSpace: 'nowrap' }}>
                {Math.round(v.currentTime)}s / {Math.round(v.duration)}s
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DebugPage() {
  const [info, setInfo] = useState<string>('No data yet')
  const [error, setError] = useState(false)

  useEffect(() => {
    (async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const id = tabs[0]?.id
      if (!id) { setInfo('No active tab'); return }
      const response = await sendToTab<Record<string, unknown>>(id, { type: 'debug-info' })
      if (response) {
        setInfo(JSON.stringify(response, null, 2))
      } else {
        setInfo('No video detected')
      }
      setError(!response)
    })()
  }, [])

  return (
    <div>
      <h2 style={styles.heading}>Debug</h2>
      <pre style={styles.debugBox}>{info}</pre>
      {error && <p style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>Could not communicate with page — try refreshing the tab.</p>}
    </div>
  )
}

async function exportData() {
  const data = await chrome.storage.local.get(null)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `skip-intro-export-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function importData() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const text = await file.text()
    const data = JSON.parse(text)
    await chrome.storage.local.clear()
    await chrome.storage.local.set(data)
    window.location.reload()
  }
  input.click()
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 420,
    height: 520,
    display: 'flex',
    background: '#0f0f1a',
    color: '#e2e8f0',
    fontFamily: 'system-ui, sans-serif',
  },
  sidebar: {
    width: 100,
    background: '#1a1a2e',
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 8px',
    borderRight: '1px solid #2d2d44',
  },
  logo: {
    fontSize: 24,
    fontWeight: 800,
    color: '#a78bfa',
    textAlign: 'center',
    marginBottom: 24,
    padding: '8px 0',
  },
  sidebarItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '10px 4px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 11,
    color: '#9ca3af',
    transition: 'all 0.15s',
  },
  sidebarItemActive: {
    background: 'rgba(167,139,250,0.15)',
    color: '#a78bfa',
  },
  statusBar: {
    marginTop: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10,
    color: '#6b7280',
    padding: '8px 4px',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    display: 'inline-block',
  },
  statusText: { fontSize: 10 },
  content: {
    flex: 1,
    padding: '16px 20px',
    overflowY: 'auto',
  },
  heading: {
    fontSize: 18,
    fontWeight: 700,
    color: '#a78bfa',
    marginBottom: 20,
    marginTop: 0,
  },
  section: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 6,
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    background: '#1a1a2e',
    color: '#e2e8f0',
    border: '1px solid #2d2d44',
    borderRadius: 6,
    fontSize: 13,
    outline: 'none',
  },
  shortcutsBox: {
    background: '#1a1a2e',
    borderRadius: 8,
    padding: '12px',
    marginBottom: 16,
  },
  shortcutRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  shortcutLabel: {
    fontSize: 13,
    color: '#e2e8f0',
  },
  keySelect: {
    width: 80,
    padding: '4px 8px',
    background: '#0f0f1a',
    color: '#e2e8f0',
    border: '1px solid #2d2d44',
    borderRadius: 4,
    fontSize: 13,
    outline: 'none',
    textAlign: 'center',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: '#9ca3af',
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: '#a78bfa',
  },
  button: {
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
    marginRight: 8,
  },
  buttonSecondary: {
    background: '#1a1a2e',
    border: '1px solid #2d2d44',
    color: '#e2e8f0',
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    background: '#1a1a2e',
    color: '#e2e8f0',
    border: '1px solid #2d2d44',
    borderRadius: 6,
    fontSize: 13,
    outline: 'none',
  },
  showItem: {
    padding: '8px 12px',
    background: '#1a1a2e',
    borderRadius: 6,
    marginBottom: 6,
    fontSize: 13,
  },
  debugBox: {
    background: '#1a1a2e',
    padding: 12,
    borderRadius: 8,
    fontSize: 11,
    color: '#9ca3af',
    overflow: 'auto',
    maxHeight: 300,
    whiteSpace: 'pre-wrap',
    fontFamily: 'monospace',
  },
  loading: {
    width: 420,
    height: 520,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f0f1a',
    color: '#a78bfa',
    fontSize: 14,
  },
}
