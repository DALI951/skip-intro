import type { Config, Episode } from '@skip-intro/core'
import { generateEpisodeId } from '@skip-intro/core'

export function createOverlay(video: HTMLVideoElement, info: { episode: Episode | null; matched: boolean }, config: Config): () => void {
  const container = document.createElement('div')
  container.id = 'skip-intro-overlay'
  container.style.cssText = 'position:absolute;bottom:80px;right:20px;z-index:999999;font-family:sans-serif'
  video.parentElement?.style.setProperty('position', 'relative')
  video.parentElement?.appendChild(container)

  let state: 'idle' | 'countdown' | 'ready' | 'marking' | 'marked' = 'idle'
  let countdownValue = config.countdownSec
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let markStart = -1
  let savedEnd = 150
  const keys = config.shortcuts

  function endTime(): number { return savedEnd }

  function render(): void {
    container.innerHTML = ''
    if (state === 'ready') {
      const btn = createSkipButton(() => {
        video.currentTime = endTime()
        showUndo()
      })
      container.appendChild(btn)
    }
    if (state === 'countdown') {
      const el = createCountdown(countdownValue, () => {
        state = 'idle'
        render()
      })
      container.appendChild(el)
    }
    if (state === 'marking') {
      const el = createMarkControls(
        markStart === -1, keys,
        () => {
          if (markStart === -1) {
            markStart = video.currentTime
            render()
          }
        },
        () => {
          if (markStart >= 0) {
            const episodeId = info.episode ? generateEpisodeId(info.episode.showName, info.episode.season, info.episode.episode) : 'unknown'
            chrome.runtime.sendMessage({ type: 'save-timestamp', episodeId, start: markStart, end: video.currentTime })
            state = 'marked'
            markStart = -1
            render()
          }
        },
      )
      container.appendChild(el)
    }
    if (state === 'marked') {
      const el = document.createElement('div')
      el.style.cssText = 'background:rgba(0,0,0,0.8);color:#a78bfa;padding:8px 16px;border-radius:8px;font-size:14px'
      el.textContent = 'Intro marked ✓'
      container.appendChild(el)
      setTimeout(() => { state = 'idle'; render() }, 2000)
    }
  }

  function checkPositionLoop(): void {
    if (!video || video.paused || video.ended) {
      if (!video.paused && !video.ended) {
        requestAnimationFrame(checkPositionLoop)
      }
      return
    }

    chrome.runtime.sendMessage({ type: 'get-timestamps' }, (timestamps: Record<string, { start: number; end: number }>) => {
      const episodeId = info.episode ? generateEpisodeId(info.episode.showName, info.episode.season, info.episode.episode) : 'unknown'
      const ts = timestamps[episodeId]
      if (!ts) return

      savedEnd = ts.end
      const currentTime = video.currentTime
      const leadTime = config.countdownSec

      if (config.skipMode === 'auto') {
        if (currentTime >= ts.start - leadTime && currentTime < ts.start && state === 'idle') {
          state = 'countdown'
          countdownValue = Math.ceil(ts.start - currentTime)
          render()
          startCountdown(ts)
        }
      } else if (config.skipMode === 'overlay') {
        if (currentTime >= ts.start && currentTime < ts.end && state === 'idle') {
          state = 'ready'
          render()
          timeoutId = setTimeout(() => { state = 'idle'; render() }, 10000)
        }
      }
    })

    requestAnimationFrame(checkPositionLoop)
  }

  function startCountdown(ts: { start: number; end: number }): void {
    const interval = setInterval(() => {
      countdownValue--
      render()
      if (countdownValue <= 0) {
        clearInterval(interval)
        video.currentTime = ts.end
        showUndo()
        state = 'idle'
        render()
      }
    }, 1000)
  }

  function showUndo(): void {
    const undoEl = document.createElement('div')
    undoEl.style.cssText = 'position:absolute;top:20px;right:20px;background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;z-index:999999;font-size:14px'
    undoEl.textContent = 'Undo Skip'
    undoEl.onclick = () => {
      video.currentTime = savedEnd - 10
      undoEl.remove()
    }
    video.parentElement?.appendChild(undoEl)
    setTimeout(() => undoEl.remove(), 5000)
  }

  const keyHandler = (e: KeyboardEvent): void => {
    if (!config.keyboardShortcuts) return
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return

    if (e.key === keys.skip && !e.ctrlKey && !e.metaKey) {
      if (state === 'ready' || state === 'countdown') {
        video.currentTime = endTime()
        state = 'idle'
        render()
      }
    }
    if (e.key === keys.markStart) {
      state = 'marking'
      markStart = -1
      render()
    }
    if (e.key === keys.markEnd && markStart >= 0) {
      const episodeId = info.episode ? generateEpisodeId(info.episode.showName, info.episode.season, info.episode.episode) : 'unknown'
      chrome.runtime.sendMessage({ type: 'save-timestamp', episodeId, start: markStart, end: video.currentTime })
      state = 'marked'
      markStart = -1
      render()
    }
  }
  document.addEventListener('keydown', keyHandler)

  video.addEventListener('pause', () => {
    if (state === 'countdown') {
      state = 'idle'
      render()
    }
  })

  if (state === 'idle') {
    checkPositionLoop()
  }
  render()

  return () => {
    container.remove()
    document.removeEventListener('keydown', keyHandler)
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function createSkipButton(onSkip: () => void): HTMLElement {
  const btn = document.createElement('button')
  btn.textContent = 'Skip Intro ▶'
  btn.style.cssText = `
    background: linear-gradient(135deg, #7c3aed, #a78bfa);
    color: white; border: none; padding: 10px 24px;
    border-radius: 24px; font-size: 14px; font-weight: 600;
    cursor: pointer; box-shadow: 0 4px 12px rgba(124,58,237,0.4);
    animation: slideUp 0.3s ease-out;
    transition: transform 0.15s;
  `
  btn.onmouseenter = () => { btn.style.transform = 'scale(1.05)' }
  btn.onmouseleave = () => { btn.style.transform = 'scale(1)' }
  btn.onclick = onSkip
  return btn
}

function createCountdown(seconds: number, onCancel: () => void): HTMLElement {
  const container = document.createElement('div')
  container.style.cssText = 'display:flex;align-items:center;gap:12px;animation:slideUp 0.3s ease-out'
  const text = document.createElement('span')
  text.style.cssText = 'background:rgba(0,0,0,0.8);color:#a78bfa;padding:8px 16px;border-radius:8px;font-size:14px;font-weight:600'
  text.textContent = `Skipping intro in ${seconds}...`
  const cancel = document.createElement('button')
  cancel.textContent = 'Cancel'
  cancel.style.cssText = 'background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px'
  cancel.onclick = onCancel
  container.appendChild(text)
  container.appendChild(cancel)
  return container
}

function createMarkControls(isStartPhase: boolean, keys: { markStart: string; markEnd: string }, onStart: () => void, onEnd: () => void): HTMLElement {
  const container = document.createElement('div')
  container.style.cssText = 'display:flex;align-items:center;gap:8px;animation:slideUp 0.3s ease-out'
  if (isStartPhase) {
    const btn = document.createElement('button')
    btn.textContent = `Mark Intro Start (${keys.markStart.toUpperCase()})`
    btn.style.cssText = 'background:linear-gradient(135deg,#059669,#34d399);color:white;border:none;padding:10px 20px;border-radius:24px;cursor:pointer;font-size:13px;font-weight:600'
    btn.onclick = onStart
    container.appendChild(btn)
  } else {
    const btn = document.createElement('button')
    btn.textContent = `Mark Intro End (${keys.markEnd.toUpperCase()})`
    btn.style.cssText = 'background:linear-gradient(135deg,#dc2626,#f87171);color:white;border:none;padding:10px 20px;border-radius:24px;cursor:pointer;font-size:13px;font-weight:600'
    btn.onclick = onEnd
    container.appendChild(btn)
  }
  return container
}

const style = document.createElement('style')
style.textContent = `
  @keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`
document.head.appendChild(style)
