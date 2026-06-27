import { defineContentScript } from '#imports'
import { getVideoInfo, detectEpisodeFromPage } from '../lib/episode-detector'
import type { Config, Episode } from '@skip-intro/core'
import { createOverlay } from '../components/overlay'

let overlayCleanup: (() => void) | null = null
let currentVideo: HTMLVideoElement | null = null
let isTracking = false

function handleVideo(video: HTMLVideoElement): void {
  if (currentVideo === video && isTracking) return

  currentVideo = video
  isTracking = true

  const info = getVideoInfo()

  chrome.runtime.sendMessage({ type: 'get-config' }, (config: Config) => {
    if (overlayCleanup) overlayCleanup()
    overlayCleanup = createOverlay(video, info, config)
  })
}

function setupObserver(): void {
  const observer = new MutationObserver(() => {
    const newVideo = document.querySelector('video')
    if (newVideo && newVideo !== currentVideo) {
      handleVideo(newVideo)
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const video = document.querySelector('video')
    if (video) handleVideo(video)
    setupObserver()
  },
})
