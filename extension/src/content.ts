import { getVideoInfo, getAllVideos, getVideoSourceInfo } from './lib/episode-detector'
import { createOverlay } from './components/overlay'

let overlayCleanup: (() => void) | null = null
let currentVideo: HTMLVideoElement | null = null
let selectedIndex = 0

function selectVideoByIndex(index: number): void {
  const videos = getAllVideos()
  if (index >= videos.length) return
  selectedIndex = index
  setupVideo(videos[index])
}

function setupVideo(video: HTMLVideoElement): void {
  if (currentVideo === video) return
  currentVideo = video
  if (overlayCleanup) overlayCleanup()
  const info = getVideoInfo()
  chrome.storage.local.get('skip-intro-config', (result) => {
    const config = result['skip-intro-config'] ?? {
      skipMode: 'overlay',
      countdownSec: 5,
      keyboardShortcuts: true,
      shortcuts: { skip: 's', markStart: 'm', markEnd: 'n' },
      desktopEnabled: true,
    }
    overlayCleanup = createOverlay(video, info, config)
  })
}

// --- Element Picker Mode ---
let pickerActive = false
let pickerOverlay: HTMLDivElement | null = null
let pickerHovered: HTMLVideoElement | null = null

function startPicker(): void {
  if (pickerActive) return
  pickerActive = true

  const banner = document.createElement('div')
  banner.id = 'skip-intro-picker-banner'
  banner.textContent = 'Click a video element to select it for SkipIntro'
  banner.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:2147483647;
    background:#7c3aed;color:#fff;text-align:center;
    padding:10px 16px;font-size:14px;font-family:sans-serif;
    box-shadow:0 2px 12px rgba(0,0,0,0.3);
  `
  document.body.appendChild(banner)

  const shield = document.createElement('div')
  shield.id = 'skip-intro-picker-shield'
  shield.style.cssText = `
    position:fixed;top:0;left:0;width:100%;height:100%;
    z-index:2147483646;cursor:crosshair;
    background:transparent;
  `
  document.body.appendChild(shield)

  pickerOverlay = document.createElement('div')
  pickerOverlay.id = 'skip-intro-picker-highlight'
  pickerOverlay.style.cssText = `
    position:fixed;pointer-events:none;z-index:2147483647;
    border:3px solid #7c3aed;border-radius:4px;
    background:rgba(124,58,237,0.15);
    transition:all 0.1s ease;display:none;
  `
  document.body.appendChild(pickerOverlay)

  const findVideo = (x: number, y: number): HTMLVideoElement | null => {
    shield.style.pointerEvents = 'none'
    const el = document.elementFromPoint(x, y)
    shield.style.removeProperty('pointer-events')
    if (!el) return null
    let target: HTMLElement | null = el as HTMLElement
    while (target && target.tagName !== 'VIDEO') {
      target = target.parentElement
    }
    return target as HTMLVideoElement
  }

  const onMove = (e: MouseEvent) => {
    const video = findVideo(e.clientX, e.clientY)
    if (video && video !== pickerHovered) {
      const rect = video.getBoundingClientRect()
      pickerOverlay!.style.display = 'block'
      pickerOverlay!.style.left = rect.left + 'px'
      pickerOverlay!.style.top = rect.top + 'px'
      pickerOverlay!.style.width = rect.width + 'px'
      pickerOverlay!.style.height = rect.height + 'px'
      pickerOverlay!.style.cursor = 'pointer'
      pickerHovered = video
    } else if (!video) {
      pickerOverlay!.style.display = 'none'
      pickerHovered = null
    }
  }

  const onPick = (e: MouseEvent) => {
    const video = findVideo(e.clientX, e.clientY)
    if (video) {
      e.preventDefault()
      e.stopPropagation()
      const videos = getAllVideos()
      const idx = videos.indexOf(video)
      if (idx >= 0) {
        selectVideoByIndex(idx)
        chrome.runtime.sendMessage({ type: 'video-picked', index: idx })
      }
      stopPicker()
    }
  }

  shield.addEventListener('mousemove', onMove)
  shield.addEventListener('click', onPick)

  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') stopPicker()
  }
  document.addEventListener('keydown', escHandler)

  const cleanup = () => {
    shield.removeEventListener('mousemove', onMove)
    shield.removeEventListener('click', onPick)
    document.removeEventListener('keydown', escHandler)
    banner.remove()
    shield.remove()
    if (pickerOverlay) pickerOverlay.remove()
    pickerActive = false
    pickerOverlay = null
    pickerHovered = null
  }
  ;(window as unknown as Record<string, unknown>).__skipIntroPickerCleanup = cleanup
}

function stopPicker(): void {
  const cleanup = (window as unknown as Record<string, unknown>).__skipIntroPickerCleanup as (() => void) | undefined
  if (cleanup) cleanup()
}
// --- End Picker ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'ping': {
      sendResponse({ pong: true })
      return true
    }
    case 'debug-info': {
      const videos = getAllVideos()
      const info = getVideoInfo()
      sendResponse({
        videosFound: videos.length,
        selectedIndex,
        currentVideo: currentVideo ? {
          src: getVideoSourceInfo(currentVideo).slice(0, 200),
          width: currentVideo.videoWidth,
          height: currentVideo.videoHeight,
          currentTime: currentVideo.currentTime,
          duration: currentVideo.duration,
        } : null,
        episode: info.episode,
        matched: info.matched,
      })
      return true
    }
    case 'get-videos': {
      const videos = getAllVideos()
      sendResponse(videos.map((v, i) => ({
        index: i,
        src: getVideoSourceInfo(v).slice(0, 200),
        width: v.videoWidth,
        height: v.videoHeight,
        currentTime: v.currentTime,
        duration: v.duration,
        isSelected: i === selectedIndex,
      })))
      return true
    }
    case 'select-video': {
      selectVideoByIndex(msg.index as number)
      sendResponse({ selected: msg.index })
      return true
    }
    case 'start-picker': {
      startPicker()
      sendResponse({ started: true })
      return true
    }
    case 'stop-picker': {
      stopPicker()
      sendResponse({ stopped: true })
      return true
    }
  }
})

const initialVideo = getAllVideos()
if (initialVideo.length > 0) {
  setupVideo(initialVideo[0])
}

const observer = new MutationObserver(() => {
  const current = getAllVideos()
  if (current.length > 0 && !currentVideo) {
    setupVideo(current[0])
  }
  if (pickerActive) {
    current.forEach(v => v.dataset.skipIntroPicker = 'true')
  }
})
observer.observe(document.body, { childList: true, subtree: true })
