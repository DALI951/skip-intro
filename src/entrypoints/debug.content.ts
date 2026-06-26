import { defineContentScript } from '#imports'

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  main() {
    console.log('[VD] main() running, isIframe:', window !== window.top)

    const isIframe = window !== window.top
    let pendingMark: 'start' | 'end' | null = null

    // ─── Utility ───────────────────────────────────────────
    function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

    function fmtTime(s: number) {
      const m = Math.floor(s / 60)
      const sec = Math.floor(s % 60)
      return `${m}:${sec.toString().padStart(2, '0')}`
    }

    function parseTime(str: string): number | null {
      str = str.trim()
      const m = str.match(/^(\d+):(\d+(?:\.\d+)?)$/)
      if (m) return parseInt(m[1]) * 60 + parseFloat(m[2])
      const n = parseFloat(str)
      return isNaN(n) ? null : n
    }

    function showToast(message: string, duration = 3500) {
      const old = document.getElementById('vd-toast')
      if (old) old.remove()
      const toast = document.createElement('div')
      toast.id = 'vd-toast'
      toast.textContent = message
      Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '999999',
        background: 'rgba(0,0,0,0.85)',
        color: '#fff',
        padding: '10px 20px',
        borderRadius: '6px',
        font: '13px/1.4 sans-serif',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        pointerEvents: 'none',
        transition: 'opacity 0.4s',
      })
      document.body.appendChild(toast)
      setTimeout(() => {
        toast.style.opacity = '0'
        setTimeout(() => toast.remove(), 400)
      }, duration)
    }

    // ─── Show / Episode Extraction ─────────────────────────
    function extractShowInfo(): { slug: string; episode: number } | null {
      try {
        const url = new URL(window.location.href)
        const watchMatch = url.pathname.match(/\/watch\/([^/]+)\/(\d+)/)
        if (watchMatch) return { slug: watchMatch[1], episode: parseInt(watchMatch[2], 10) }
        const titleMatch = document.title.match(/^(.+?)\s*الحلقة\s*(\d+)/)
        if (titleMatch) {
          const slug = titleMatch[1].trim().toLowerCase().replace(/\s+/g, '-')
          return { slug, episode: parseInt(titleMatch[2], 10) }
        }
        const engMatch = document.title.match(/^(.+?)\s+Episode\s+(\d+)/i)
        if (engMatch) {
          const slug = engMatch[1].trim().toLowerCase().replace(/\s+/g, '-')
          return { slug, episode: parseInt(engMatch[2], 10) }
        }
      } catch {}
      return null
    }

    // ─── Storage ───────────────────────────────────────────
    const STORAGE_KEY = 'vd-marks'
    type MarkData = { start: number; end: number }

    function epKey(slug: string, ep: number) { return `${slug}/${ep}` }

    async function getMarkData(): Promise<Record<string, MarkData>> {
      const data = await chrome.storage.local.get(STORAGE_KEY)
      return (data[STORAGE_KEY] || {}) as Record<string, MarkData>
    }

    async function getSavedMark(key: string): Promise<MarkData | null> {
      const marks = await getMarkData()
      return marks[key] || null
    }

    async function saveMark(key: string, start: number, end: number) {
      const marks = await getMarkData()
      marks[key] = { start, end }
      await chrome.storage.local.set({ [STORAGE_KEY]: marks })
    }

    async function clearMark(key: string) {
      const marks = await getMarkData()
      delete marks[key]
      await chrome.storage.local.set({ [STORAGE_KEY]: marks })
    }

    // ─── Skip Button (iframe) ──────────────────────────────
    let skipInitialized = false

    function initAutoSkip(data: { start: number; end: number }) {
      if (skipInitialized) return
      skipInitialized = true
      console.log('[VD] initAutoSkip called, start:', data.start, 'end:', data.end)
      const videos = document.querySelectorAll('video')
      if (videos.length === 0) {
        console.log('[VD] No video found, retrying in 1s')
        skipInitialized = false
        setTimeout(() => initAutoSkip(data), 1000)
        return
      }

      const video = videos[0]
      createSkipButton(video, data.start, data.end)
    }

    function createSkipButton(video: HTMLVideoElement, start: number, end: number) {
      const duration = end - start
      if (duration <= 0) return
      const btn = document.createElement('div')
      btn.textContent = `Skip +${fmtTime(duration)}`
      btn.style.cssText = `
        position:absolute;bottom:60px;right:12px;z-index:99999;
        background:#7c3aed;color:#fff;padding:8px 16px;border-radius:6px;
        font:bold 13px/1 sans-serif;cursor:pointer;user-select:none;
        box-shadow:0 2px 10px rgba(0,0,0,0.5);transition:opacity .3s;
        opacity:0;pointer-events:none;
      `
      btn.onclick = (e) => {
        e.stopPropagation()
        video.currentTime = Math.min(video.duration, video.currentTime + duration)
        showToast(`Skipped +${fmtTime(duration)}`)
      }

      const parent = video.parentElement
      if (!parent) return
      const origPos = parent.style.position
      if (origPos !== 'relative' && origPos !== 'absolute' && origPos !== 'fixed') {
        parent.style.position = 'relative'
      }
      parent.appendChild(btn)

      let hideTimer: number | undefined
      function showBtn() {
        btn.style.opacity = '1'
        btn.style.pointerEvents = 'auto'
        if (hideTimer) clearTimeout(hideTimer)
        hideTimer = window.setTimeout(() => {
          btn.style.opacity = '0'
          btn.style.pointerEvents = 'none'
        }, 2500)
      }
      parent.addEventListener('mousemove', showBtn)
    }

    // ─── Message Handler (shared) ─────────────────────────
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'vd-skip-data') {
        console.log('[VD] received vd-skip-data, isIframe:', isIframe, 'start:', e.data.start, 'end:', e.data.end)
        if (isIframe) initAutoSkip(e.data)
      }
      if (e.data?.type === 'vd-current-time') {
        if (isIframe) return
        if (pendingMark === 'start') {
          const inp = document.getElementById('vd-start') as HTMLInputElement
          if (inp) inp.value = fmtTime(e.data.time)
          pendingMark = null
          const p = panel
          if (p) { buildPanelContent(); loadSavedState() }
        } else if (pendingMark === 'end') {
          const inp = document.getElementById('vd-end') as HTMLInputElement
          if (inp) inp.value = fmtTime(e.data.time)
          pendingMark = null
          const p = panel
          if (p) { buildPanelContent(); loadSavedState() }
        }
      }
    })

    // ─── Iframe: report and handle get-time ───────────────
    if (isIframe) {
      console.log('[VD] iframe content script running')
      window.parent.postMessage({ type: 'vd-iframe-report' }, '*')

      window.addEventListener('message', (e) => {
        if (e.data?.type === 'vd-get-time') {
          function retryGetTime() {
            const video = document.querySelector('video')
            if (video) {
              window.parent.postMessage({ type: 'vd-current-time', time: video.currentTime }, '*')
            } else {
              setTimeout(retryGetTime, 300)
            }
          }
          retryGetTime()
        }
      })
      return
    }

    // ─── Top Frame: Panel ─────────────────────────────────
    let panel: HTMLDivElement | null = null
    let currentSlug: string | null = null

    function buildPanelContent() {
      if (!panel) return
      const info = extractShowInfo()
      currentSlug = info?.slug ?? null

      panel.querySelector('#vd-content')!.innerHTML = `
        <div style="margin-bottom:6px"><span style="color:#888">Show:</span> ${currentSlug ? esc(currentSlug.replace(/-/g, ' ')) : '(unknown)'}</div>

        <div style="margin-top:10px;font-weight:bold;color:#7c3aed;font-size:13px">Intro Marking</div>

        <div style="margin-top:6px;display:flex;align-items:center;gap:4px">
          <span style="color:#888;width:36px">Start:</span>
          <input id="vd-start" type="text" value="1:25" style="
            width:70px;background:#16213e;color:#e0e0e0;border:1px solid #333;
            border-radius:3px;padding:3px 6px;font:12px monospace
          ">
          <button class="vd-adjust" data-target="start" data-delta="-5" style="
            background:#333;color:#ccc;border:none;border-radius:3px;padding:2px 8px;
            cursor:pointer;font:11px monospace
          ">-5s</button>
          <button class="vd-adjust" data-target="start" data-delta="5" style="
            background:#333;color:#ccc;border:none;border-radius:3px;padding:2px 8px;
            cursor:pointer;font:11px monospace
          ">+5s</button>
        </div>

        <div style="margin-top:4px;display:flex;align-items:center;gap:4px">
          <span style="color:#888;width:36px">End:</span>
          <input id="vd-end" type="text" value="1:55" style="
            width:70px;background:#16213e;color:#e0e0e0;border:1px solid #333;
            border-radius:3px;padding:3px 6px;font:12px monospace
          ">
          <button class="vd-adjust" data-target="end" data-delta="-5" style="
            background:#333;color:#ccc;border:none;border-radius:3px;padding:2px 8px;
            cursor:pointer;font:11px monospace
          ">-5s</button>
          <button class="vd-adjust" data-target="end" data-delta="5" style="
            background:#333;color:#ccc;border:none;border-radius:3px;padding:2px 8px;
            cursor:pointer;font:11px monospace
          ">+5s</button>
        </div>

        <div style="margin-top:4px;color:#888">
          Duration: <span id="vd-duration">0:30</span>
        </div>

        <div style="margin-top:8px;display:flex;gap:6px">
          <button id="vd-mark-start" style="
            flex:1;background:#1e3a2e;color:#34d399;border:1px solid #34d399;
            border-radius:4px;padding:5px 0;cursor:pointer;font:12px monospace
          ">Mark Start</button>
          <button id="vd-mark-end" style="
            flex:1;background:#1e3a2e;color:#34d399;border:1px solid #34d399;
            border-radius:4px;padding:5px 0;cursor:pointer;font:12px monospace
          ">Mark End</button>
        </div>

        <div id="vd-mark-status" style="margin-top:4px;font-size:11px;color:#888">
          Status: <span id="vd-status-text">not saved</span>
        </div>

        <div style="margin-top:6px;display:flex;gap:6px">
          <button id="vd-save" style="
            flex:1;background:#7c3aed;color:white;border:none;
            border-radius:4px;padding:5px 0;cursor:pointer;font:12px monospace
          ">Save</button>
          <button id="vd-clear" style="
            flex:1;background:#333;color:#f87171;border:1px solid #f87171;
            border-radius:4px;padding:5px 0;cursor:pointer;font:12px monospace
          ">Clear</button>
        </div>
      `

      bindPanelEvents()
    }

    function bindPanelEvents() {
      const panelEl = panel
      if (!panelEl) return

      panelEl.querySelector('#vd-mark-start')?.addEventListener('click', () => {
        pendingMark = 'start'
        document.querySelectorAll('iframe').forEach(iframe => {
          iframe.contentWindow?.postMessage({ type: 'vd-get-time' }, '*')
        })
        showToast('Click Mark Start to capture...')
      })

      panelEl.querySelector('#vd-mark-end')?.addEventListener('click', () => {
        pendingMark = 'end'
        document.querySelectorAll('iframe').forEach(iframe => {
          iframe.contentWindow?.postMessage({ type: 'vd-get-time' }, '*')
        })
        showToast('Click Mark End to capture...')
      })

      panelEl.querySelectorAll('.vd-adjust').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const target = (btn as HTMLElement).dataset.target
          const delta = parseInt((btn as HTMLElement).dataset.delta || '0', 10)
          const inp = document.getElementById(`vd-${target}`) as HTMLInputElement
          if (!inp) return
          const secs = parseTime(inp.value)
          if (secs === null) return
          const newSecs = Math.max(0, secs + delta)
          inp.value = fmtTime(newSecs)
          updateDuration()
        })
      })

      const startInput = document.getElementById('vd-start') as HTMLInputElement
      const endInput = document.getElementById('vd-end') as HTMLInputElement
      startInput?.addEventListener('input', updateDuration)
      endInput?.addEventListener('input', updateDuration)

      panelEl.querySelector('#vd-save')?.addEventListener('click', async () => {
        if (!currentSlug) { showToast('No show detected'); return }
        const info = extractShowInfo()
        const ep = info?.episode
        const key = ep ? epKey(currentSlug, ep) : currentSlug
        const start = parseTime(startInput?.value || '')
        const end = parseTime(endInput?.value || '')
        if (start === null || end === null || start >= end) {
          showToast('Invalid start/end times')
          return
        }
        await saveMark(key, start, end)
        const statusEl = document.getElementById('vd-status-text')
        if (statusEl) statusEl.textContent = '✅ saved'
        showToast('Intro timestamps saved!')
        broadcastToIframes(start, end)
      })

      panelEl.querySelector('#vd-clear')?.addEventListener('click', async () => {
        if (!currentSlug) return
        const info = extractShowInfo()
        const ep = info?.episode
        const key = ep ? epKey(currentSlug, ep) : currentSlug
        await clearMark(key)
        const statusEl = document.getElementById('vd-status-text')
        if (statusEl) statusEl.textContent = 'cleared'
        showToast('Intro timestamps cleared')
      })
    }

    function updateDuration() {
      const startInput = document.getElementById('vd-start') as HTMLInputElement
      const endInput = document.getElementById('vd-end') as HTMLInputElement
      const durEl = document.getElementById('vd-duration')
      if (!startInput || !endInput || !durEl) return
      const start = parseTime(startInput.value)
      const end = parseTime(endInput.value)
      if (start !== null && end !== null && end > start) {
        durEl.textContent = fmtTime(end - start)
      } else {
        durEl.textContent = '—'
      }
    }

    async function loadSavedState() {
      if (!currentSlug) return
      const info = extractShowInfo()
      const ep = info?.episode
      const key = ep ? epKey(currentSlug, ep) : currentSlug
      const mark = await getSavedMark(key)
      const startInput = document.getElementById('vd-start') as HTMLInputElement
      const endInput = document.getElementById('vd-end') as HTMLInputElement
      const statusEl = document.getElementById('vd-status-text')
      if (mark) {
        if (startInput) startInput.value = fmtTime(mark.start)
        if (endInput) endInput.value = fmtTime(mark.end)
        if (statusEl) statusEl.textContent = '✅ saved'
        updateDuration()
      } else {
        if (statusEl) statusEl.textContent = 'not saved'
      }
    }

    function showPanel() {
      if (panel) {
        panel.remove()
        panel = null
        return
      }

      panel = document.createElement('div')
      panel.id = 'vd-debug'
      panel.style.cssText = `
        position: fixed; top: 10px; right: 10px; z-index: 999999;
        background: #1a1a2e; color: #e0e0e0; padding: 12px 16px;
        border-radius: 8px; font: 12px/1.5 monospace;
        max-width: 380px; overflow: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        border: 1px solid #333;
      `

      const closeBtn = document.createElement('button')
      closeBtn.textContent = 'X'
      closeBtn.style.cssText = `position:absolute;top:4px;right:8px;background:none;border:none;color:#999;cursor:pointer;font-size:14px`
      closeBtn.onclick = () => { panel!.remove(); panel = null }

      const title = document.createElement('div')
      title.style.cssText = 'font-weight:bold;font-size:14px;margin-bottom:8px;color:#7c3aed'
      title.textContent = 'Video Detector'

      const content = document.createElement('div')
      content.id = 'vd-content'

      panel.append(closeBtn, title, content)
      document.body.appendChild(panel)

      buildPanelContent()
      loadSavedState()
      checkSavedMarks()
    }

    async function checkSavedMarks() {
      if (isIframe) return
      const info = extractShowInfo()
      if (!info) { console.log('[VD] checkSavedMarks: no show info'); return }

      const key = epKey(info.slug, info.episode)
      let mark = await getSavedMark(key)
      if (!mark) mark = await getSavedMark(info.slug)

      if (mark) {
        console.log('[VD] checkSavedMarks: using saved', mark.start, '-', mark.end)
        broadcastToIframes(mark.start, mark.end)
      } else {
        console.log('[VD] checkSavedMarks: no marks, broadcasting default 90s')
        broadcastToIframes(0, 90)
      }
    }

    function broadcastToIframes(start: number, end: number) {
      const iframes = document.querySelectorAll('iframe')
      console.log('[VD] broadcastToIframes: iframes found:', iframes.length, 'start:', start, 'end:', end)
      iframes.forEach(iframe => {
        iframe.contentWindow?.postMessage({ type: 'vd-skip-data', start, end }, '*')
      })
    }

    // ─── Floating VD Button ───────────────────────────────
    if (!isIframe) {
      const btn = document.createElement('div')
      btn.id = 'vd-float-btn'
      btn.textContent = 'VD'
      btn.style.cssText = `
        position:fixed;top:10px;left:10px;z-index:999999;
        width:36px;height:36px;border-radius:50%;
        background:#7c3aed;color:white;font:bold 14px/36px monospace;
        text-align:center;cursor:pointer;user-select:none;
        box-shadow:0 2px 8px rgba(0,0,0,0.4);transition:transform 0.15s
      `
      btn.onmouseenter = () => btn.style.transform = 'scale(1.1)'
      btn.onmouseleave = () => btn.style.transform = 'scale(1)'
      btn.onclick = showPanel
      document.body.appendChild(btn)

      setTimeout(checkSavedMarks, 1500)
    }
  },
})
