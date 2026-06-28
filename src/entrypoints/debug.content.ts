import { defineContentScript } from '#imports'

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  main() {
    const isIframe = window !== window.top

    // ─── CSS injection ──────────────────────────────────────
    const styleId = 'vd-styles'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        #vd-debug { position:fixed;z-index:999999;background:#111;color:#d4d4d4;
          padding:14px;font:12px/1.5 monospace,sans-serif;width:260px;border:1px solid #222 }
        #vd-debug .vd-handle { cursor:grab;user-select:none }
        #vd-debug .vd-handle:active { cursor:grabbing }
        #vd-debug input { background:#18181b;color:#d4d4d4;border:1px solid #222;
          outline:none;font:12px/1.4 monospace,sans-serif }
        #vd-debug input:focus { border-color:#555 }
        #vd-debug .vd-input { width:100%;display:block;padding:4px 8px }
        #vd-debug .vd-sm { font-size:11px;color:#555 }
        #vd-debug .vd-tab { flex:1;padding:5px 0;cursor:pointer;font:12px/1 monospace,sans-serif;
          border:none;transition:background .15s;background:#18181b;color:#666 }
        #vd-debug .vd-tab.active { background:#e05a3a;color:#fff;font-weight:600 }
        #vd-debug .vd-tab:first-child { border-right:1px solid #222 }
        #vd-debug .vd-btn { padding:6px 0;cursor:pointer;font:12px/1 monospace,sans-serif;
          font-weight:600;border:none;color:#fff }
        #vd-debug .vd-btn-save { background:#2a7d46 }
        #vd-debug .vd-btn-clear { background:transparent;color:#666;border:1px solid #333;padding:6px 12px }
        #vd-debug .vd-saved-header { font-size:12px;color:#666;cursor:pointer;user-select:none;
          display:flex;align-items:center;gap:4px }
        #vd-debug .vd-saved-entry { display:flex;align-items:center;gap:4px;padding:3px 4px;
          cursor:pointer;font-size:12px;color:#888 }
        #vd-debug .vd-saved-entry:hover { background:#18181b }
        #vd-debug .vd-del { background:none;border:none;color:#555;cursor:pointer;font-size:11px;padding:0 2px }
        #vd-toast { position:fixed;top:20px;left:50%;transform:translateX(-50%);
          z-index:999999;background:#18181b;color:#d4d4d4;
          padding:8px 16px;font:12px/1.4 monospace,sans-serif;
          border:1px solid #333;pointer-events:auto;transition:opacity .25s }

      `
      document.head.appendChild(style)
    }

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

    function slugToName(slug: string) {
      return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }

    function showToast(message: string, dur = 3500) {
      const old = document.getElementById('vd-toast')
      if (old) old.remove()
      const toast = document.createElement('div')
      toast.id = 'vd-toast'
      toast.textContent = message
      document.body.appendChild(toast)
      setTimeout(() => {
        toast.style.opacity = '0'
        setTimeout(() => toast.remove(), 250)
      }, dur)
    }

    // ─── Show Name Extraction ──────────────────────────────
    function extractShowSlug(): string | null {
      try {
        const url = new URL(window.location.href)
        const path = url.pathname

        const watchMatch = path.match(/\/watch\/([^/]+)/)
        if (watchMatch) return watchMatch[1]

        const showMatch = path.match(/\/(?:shows?|series|tv|movie)\/([^/]+)/i)
        if (showMatch) return showMatch[1]

        const slugMatch = path.match(/\/([a-z0-9-]+)\/(?:e(?:p(?:isode)?)?\/?\d+|season\/\d+\/episode\/\d+)/i)
        if (slugMatch) return slugMatch[1]

        const title = document.title
        const patterns = [
          { re: /^(.+?)\s*الحلقة\s*\d+/ },
          { re: /^(.+?)\s+Episode\s+\d+/i },
          { re: /^(.+?)\s+E\d+/i },
          { re: /^(.+?)\s+-\s+S\d+\s*E\d+/i },
          { re: /^(.+?)\s+S\d+:E\d+/i },
        ]
        for (const { re } of patterns) {
          const m = title.match(re)
          if (m) return m[1].trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        }
      } catch {}
      return null
    }

    // ─── Storage ───────────────────────────────────────────
    const STORAGE_KEY = 'vd-marks'
    const PANEL_POS_KEY = 'vd-panel-pos'
    type MarkData = { duration: number; showName: string; savedAt: number }

    async function getMarkData(): Promise<Record<string, MarkData>> {
      const data = await chrome.storage.local.get(STORAGE_KEY)
      const raw = (data[STORAGE_KEY] || {}) as Record<string, any>
      let changed = false
      for (const [k, v] of Object.entries(raw)) {
        if ('start' in v && 'end' in v) {
          raw[k] = {
            duration: Math.max(0, (v.end as number) - (v.start as number)),
            showName: v.showName || '',
            savedAt: v.savedAt || Date.now(),
          }
          changed = true
        }
        if ('episode' in v) {
          delete v.episode
          changed = true
        }
      }
      if (changed) await chrome.storage.local.set({ [STORAGE_KEY]: raw })
      return raw as Record<string, MarkData>
    }

    async function getSavedMark(key: string): Promise<MarkData | null> {
      const marks = await getMarkData()
      return marks[key] || null
    }

    async function saveMark(key: string, duration: number, showName: string) {
      const marks = await getMarkData()
      marks[key] = { duration, showName, savedAt: Date.now() }
      await chrome.storage.local.set({ [STORAGE_KEY]: marks })
    }

    async function clearMark(key: string) {
      const marks = await getMarkData()
      delete marks[key]
      await chrome.storage.local.set({ [STORAGE_KEY]: marks })
    }

    async function getPanelPos(): Promise<{ top: number; left: number }> {
      const data = await chrome.storage.local.get(PANEL_POS_KEY)
      return data[PANEL_POS_KEY] || { top: 12, left: window.innerWidth - 272 }
    }

    async function savePanelPos(pos: { top: number; left: number }) {
      await chrome.storage.local.set({ [PANEL_POS_KEY]: pos })
    }

    // ─── Skip Button ───────────────────────────────────────
    let currentSkipBtnRef: (() => void) | null = null

    function initAutoSkip(duration: number, retries = 3) {
      if (currentSkipBtnRef) {
        currentSkipBtnRef()
        currentSkipBtnRef = null
      }
      if (duration <= 0) return
      const videos = document.querySelectorAll('video')
      if (videos.length === 0 && retries > 0) {
        setTimeout(() => initAutoSkip(duration, retries - 1), 1000)
        return
      }
      if (videos.length === 0) return
      createSkipButton(videos[0], duration)
    }

    function createSkipButton(video: HTMLVideoElement, duration: number) {
      const btn = document.createElement('div')
      btn.textContent = `Skip +${fmtTime(duration)}`
      Object.assign(btn.style, {
        position: 'absolute', bottom: '60px', right: '12px', zIndex: '99999',
        background: '#e05a3a', color: '#fff', padding: '8px 16px',
        font: 'bold 13px/1 monospace, sans-serif', cursor: 'pointer',
        userSelect: 'none', opacity: '0', pointerEvents: 'none',
        transition: 'opacity .25s',
      })

      btn.onclick = (e) => {
        e.stopPropagation()
        video.currentTime = Math.min(video.duration, video.currentTime + duration)
        showToast(`Skipped +${fmtTime(duration)}`)
      }

      const parent = video.parentElement
      if (!parent) return
      if (parent.style.position !== 'relative' && parent.style.position !== 'absolute' && parent.style.position !== 'fixed') {
        parent.style.position = 'relative'
      }
      parent.appendChild(btn)

      let hideTimer: number | undefined
      const showBtn = () => {
        btn.style.opacity = '1'
        btn.style.pointerEvents = 'auto'
        if (hideTimer) clearTimeout(hideTimer)
        hideTimer = window.setTimeout(() => {
          btn.style.opacity = '0'
          btn.style.pointerEvents = 'none'
        }, 2500)
      }
      parent.addEventListener('mousemove', showBtn)

      currentSkipBtnRef = () => {
        parent.removeEventListener('mousemove', showBtn)
        if (btn.parentElement) btn.remove()
      }
    }

    // ─── Broadcast ─────────────────────────────────────────
    function broadcastToIframes(duration: number) {
      document.querySelectorAll('iframe').forEach(iframe => {
        iframe.contentWindow?.postMessage({ type: 'vd-skip-data', start: 0, end: duration }, '*')
      })
    }

    function broadcastLive(duration: number) {
      if (duration <= 0) return
      initAutoSkip(duration)
      broadcastToIframes(duration)
    }

    // ─── Iframe handler ────────────────────────────────────
    if (isIframe) {
      window.addEventListener('message', (e) => {
        if (e.data?.type === 'vd-skip-data') {
          const duration = (e.data.end || 0) - (e.data.start || 0)
          if (duration > 0) initAutoSkip(duration)
        }
      })
      return
    }

    // ─── Top Frame: Panel ─────────────────────────────────
    let panel: HTMLDivElement | null = null
    let currentMode: 'timestamps' | 'length' = 'length'
    let broadcastTimer: number | undefined
    let savedListOpen = false

    function getDuration(): number {
      if (currentMode === 'timestamps') {
        const start = parseTime((document.getElementById('vd-start') as HTMLInputElement)?.value || '')
        const end = parseTime((document.getElementById('vd-end') as HTMLInputElement)?.value || '')
        if (start !== null && end !== null && end > start) return end - start
        return 0
      }
      const val = parseInt((document.getElementById('vd-length') as HTMLInputElement)?.value || '', 10)
      return !isNaN(val) && val > 0 ? val : 0
    }

    function getShowName(): string {
      return (document.getElementById('vd-show-name') as HTMLInputElement)?.value?.trim() || ''
    }

    function nameToSlug(name: string): string {
      return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    }

    function buildPanelContent() {
      if (!panel) return
      const autoSlug = extractShowSlug()
      const autoName = autoSlug ? slugToName(autoSlug) : ''
      const currentName = getShowName() || autoName

      panel.querySelector('#vd-content')!.innerHTML = `
        <div style="margin-bottom:8px">
          <input id="vd-show-name" type="text" placeholder="Show name" value="${esc(currentName)}"
            class="vd-input" autocomplete="off">
          ${autoName ? `<div style="margin-top:2px" class="vd-sm">Auto: ${esc(autoName)}</div>` : ''}
        </div>

        <div style="display:flex;margin-bottom:8px;border:1px solid #222">
          <button id="vd-mode-timestamps" class="vd-tab${currentMode === 'timestamps' ? ' active' : ''}">Timestamps</button>
          <button id="vd-mode-length" class="vd-tab${currentMode === 'length' ? ' active' : ''}">Length</button>
        </div>

        <div id="vd-timestamps-section" style="${currentMode !== 'timestamps' ? 'display:none' : ''}">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span class="vd-sm" style="width:32px">Start</span>
            <input id="vd-start" type="text" value="0:00" class="vd-input" style="flex:1" autocomplete="off">
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span class="vd-sm" style="width:32px">End</span>
            <input id="vd-end" type="text" value="0:30" class="vd-input" style="flex:1" autocomplete="off">
          </div>
          <div class="vd-sm">skip <span id="vd-duration" style="color:#d4d4d4">0:30</span></div>
        </div>

        <div id="vd-length-section" style="${currentMode !== 'length' ? 'display:none' : ''}">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="vd-sm">Skip</span>
            <input id="vd-length" type="number" min="1" value="30" style="
              width:70px;background:#18181b;color:#d4d4d4;border:1px solid #222;
              padding:4px 8px;font:13px/1.4 monospace,sans-serif;outline:none"
            autocomplete="off">
            <span class="vd-sm">seconds</span>
          </div>
        </div>

        <div style="margin-top:6px" class="vd-sm">
          <span id="vd-status-text">not saved</span>
        </div>

        <div style="margin-top:8px;display:flex;gap:6px">
          <button id="vd-save" class="vd-btn vd-btn-save" style="flex:1">Save</button>
          <button id="vd-clear" class="vd-btn-clear">Clear</button>
        </div>

        <div style="margin-top:8px;border-top:1px solid #222;padding-top:6px">
          <div class="vd-saved-header">
            <span id="vd-saved-arrow">▶</span>
            <span>Saved Skips (<span id="vd-saved-count">0</span>)</span>
          </div>
          <div id="vd-saved-entries" style="margin-top:4px;display:none"></div>
        </div>
      `

      loadSavedState()
      renderSavedList()
    }

    function handlePanelClick(e: Event) {
      const target = e.target as HTMLElement

      if (target.id === 'vd-mode-timestamps') {
        currentMode = 'timestamps'
        buildPanelContent()
        broadcast()
        return
      }

      if (target.id === 'vd-mode-length') {
        currentMode = 'length'
        buildPanelContent()
        broadcast()
        return
      }

      if (target.id === 'vd-save') {
        handleSave()
        return
      }

      if (target.id === 'vd-clear') {
        handleClear()
        return
      }

      if (target.classList.contains('vd-saved-header') || target.closest('.vd-saved-header')) {
        savedListOpen = !savedListOpen
        const container = document.getElementById('vd-saved-entries')
        const arrow = document.getElementById('vd-saved-arrow')
        if (container) container.style.display = savedListOpen ? '' : 'none'
        if (arrow) arrow.textContent = savedListOpen ? '▼' : '▶'
        return
      }

      const entry = target.closest('[data-key]') as HTMLElement
      if (!entry) return

      const delBtn = target.closest('.vd-del') as HTMLElement
      if (delBtn) {
        const key = delBtn.dataset.key!
        clearMark(key).then(() => { renderSavedList() })
        return
      }

      const key = entry.dataset.key!
      getSavedMark(key).then(mark => {
        if (!mark) return
        const nameInput = document.getElementById('vd-show-name') as HTMLInputElement
        const startInput = document.getElementById('vd-start') as HTMLInputElement
        const endInput = document.getElementById('vd-end') as HTMLInputElement
        const lengthInput = document.getElementById('vd-length') as HTMLInputElement
        if (nameInput) nameInput.value = mark.showName
        if (startInput) startInput.value = '0:00'
        if (endInput) endInput.value = fmtTime(mark.duration)
        if (lengthInput) lengthInput.value = String(mark.duration)
        updateDurationDisplay()
        const statusEl = document.getElementById('vd-status-text')
        if (statusEl) statusEl.textContent = 'loaded'
        broadcast()
      })
    }

    function handlePanelInput(e: Event) {
      const target = e.target as HTMLElement
      if (target.id === 'vd-start' || target.id === 'vd-end') {
        updateDurationDisplay()
        broadcast()
      } else if (target.id === 'vd-length') {
        broadcast()
      }
    }

    function updateDurationDisplay() {
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

    async function handleSave() {
      const showName = getShowName()
      if (!showName) { showToast('Enter a show name'); return }
      const slug = nameToSlug(showName)
      const duration = getDuration()
      if (duration <= 0) { showToast('Duration must be greater than 0'); return }
      await saveMark(slug, duration, showName)
      const statusEl = document.getElementById('vd-status-text')
      if (statusEl) statusEl.textContent = 'saved'
      showToast('Saved!')
      renderSavedList()
      broadcast()
    }

    async function handleClear() {
      const showName = getShowName()
      if (!showName) return
      const slug = nameToSlug(showName)
      await clearMark(slug)
      const statusEl = document.getElementById('vd-status-text')
      if (statusEl) statusEl.textContent = 'cleared'
      showToast('Cleared')
      renderSavedList()
    }

    function broadcast() {
      const duration = getDuration()
      if (broadcastTimer) clearTimeout(broadcastTimer)
      broadcastTimer = window.setTimeout(() => {
        if (duration > 0) broadcastLive(duration)
      }, 200)
    }

    async function renderSavedList() {
      const container = document.getElementById('vd-saved-entries')
      const countEl = document.getElementById('vd-saved-count')
      if (!container) return
      const marks = await getMarkData()
      const entries = Object.entries(marks)
        .sort(([, a], [, b]) => b.savedAt - a.savedAt)

      if (countEl) countEl.textContent = String(entries.length)

      if (entries.length === 0) {
        container.innerHTML = '<div class="vd-sm" style="color:#444">no saved skips</div>'
        return
      }

      container.innerHTML = entries.map(([key, data]) => `
        <div class="vd-saved-entry" data-key="${esc(key)}">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${esc(data.showName || slugToName(key))}
          </span>
          <button class="vd-del" data-key="${esc(key)}">✕</button>
        </div>
      `).join('')

      if (savedListOpen) container.style.display = ''
    }

    async function loadSavedState() {
      const nameInput = document.getElementById('vd-show-name') as HTMLInputElement
      if (!nameInput) return
      const showName = nameInput.value.trim()
      if (!showName) return
      const slug = nameToSlug(showName)
      const mark = await getSavedMark(slug)
      const startInput = document.getElementById('vd-start') as HTMLInputElement
      const endInput = document.getElementById('vd-end') as HTMLInputElement
      const lengthInput = document.getElementById('vd-length') as HTMLInputElement
      const statusEl = document.getElementById('vd-status-text')
      if (mark) {
        if (startInput) startInput.value = '0:00'
        if (endInput) endInput.value = fmtTime(mark.duration)
        if (lengthInput) lengthInput.value = String(mark.duration)
        if (statusEl) statusEl.textContent = 'saved'
        updateDurationDisplay()
      } else {
        if (statusEl) statusEl.textContent = 'not saved'
      }
    }

    // ─── Draggable ─────────────────────────────────────────
    let dragState: { startX: number; startY: number; origLeft: number; origTop: number } | null = null

    function onDragStart(e: MouseEvent) {
      if (!panel) return
      const rect = panel.getBoundingClientRect()
      dragState = {
        startX: e.clientX,
        startY: e.clientY,
        origLeft: rect.left,
        origTop: rect.top,
      }
      document.addEventListener('mousemove', onDragMove)
      document.addEventListener('mouseup', onDragEnd)
    }

    function onDragMove(e: MouseEvent) {
      if (!dragState || !panel) return
      const dx = e.clientX - dragState.startX
      const dy = e.clientY - dragState.startY
      panel.style.left = `${dragState.origLeft + dx}px`
      panel.style.top = `${dragState.origTop + dy}px`
      panel.style.right = 'auto'
      panel.style.bottom = 'auto'
    }

    function onDragEnd() {
      document.removeEventListener('mousemove', onDragMove)
      document.removeEventListener('mouseup', onDragEnd)
      if (!panel) return
      const rect = panel.getBoundingClientRect()
      savePanelPos({ top: rect.top, left: rect.left })
      dragState = null
    }

    // ─── Panel ──────────────────────────────────────────────
    function showPanel() {
      if (panel) {
        panel.remove()
        panel = null
        return
      }

      panel = document.createElement('div')
      panel.id = 'vd-debug'

      getPanelPos().then(pos => {
        if (!panel) return
        panel.style.top = `${pos.top}px`
        panel.style.left = `${pos.left}px`
      })

      const closeBtn = document.createElement('button')
      closeBtn.textContent = '✕'
      closeBtn.style.cssText = 'position:absolute;top:6px;right:8px;background:none;border:none;color:#555;cursor:pointer;font-size:13px'
      closeBtn.onclick = () => { panel!.remove(); panel = null }

      const handle = document.createElement('div')
      handle.className = 'vd-handle'
      Object.assign(handle.style, {
        position: 'absolute', top: '0', left: '0', right: '28px', height: '32px',
      })
      handle.addEventListener('mousedown', onDragStart)

      const headerAccent = document.createElement('div')
      Object.assign(headerAccent.style, {
        position: 'absolute', top: '0', left: '0', width: '3px', height: '32px',
        background: '#e05a3a', pointerEvents: 'none',
      })

      const title = document.createElement('div')
      title.textContent = 'Skip Intro'
      Object.assign(title.style, {
        fontWeight: '700', fontSize: '14px', marginBottom: '10px',
        color: '#d4d4d4', padding: '8px 8px 0 8px', pointerEvents: 'none',
      })

      const content = document.createElement('div')
      content.id = 'vd-content'

      panel.append(handle, headerAccent, closeBtn, title, content)
      document.body.appendChild(panel)

      content.addEventListener('click', handlePanelClick)
      content.addEventListener('input', handlePanelInput)

      buildPanelContent()
    }

    async function checkSavedMarks(retries = 5) {
      if (isIframe) return
      const nameInput = document.getElementById('vd-show-name') as HTMLInputElement
      if (!nameInput) {
        if (retries > 0) {
          setTimeout(() => checkSavedMarks(retries - 1), 1000)
        }
        return
      }
      const showName = nameInput.value.trim()
      if (!showName) return
      const slug = nameToSlug(showName)
      const mark = await getSavedMark(slug)
      if (mark) broadcastLive(mark.duration)
    }

    // ─── Listen for toolbar icon click ──────────────────────
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'toggle-panel') showPanel()
    })

    // ─── Auto-load saved mark on page load ──────────────────
    setTimeout(checkSavedMarks, 1500)
  },
})
