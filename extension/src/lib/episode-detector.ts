import type { Episode, EpisodeMatchResult } from '@skip-intro/core'
import { matchEpisode } from '@skip-intro/core'

export interface VideoInfo {
  element: HTMLVideoElement
  episode: Episode | null
  matched: boolean
}

export interface VideoListEntry {
  index: number
  src: string
  width: number
  height: number
  currentTime: number
  duration: number
  isSelected: boolean
}

export function detectVideo(): HTMLVideoElement | null {
  const videos = document.querySelectorAll('video')
  if (videos.length === 0) return null
  if (videos.length === 1) return videos[0]
  let largest = videos[0]
  for (let i = 1; i < videos.length; i++) {
    if (videos[i].videoWidth > largest.videoWidth) {
      largest = videos[i]
    }
  }
  return largest
}

export function getAllVideos(): HTMLVideoElement[] {
  return Array.from(document.querySelectorAll('video'))
}

export function getVideoSourceInfo(video: HTMLVideoElement): string {
  return video.src || video.querySelector('source')?.getAttribute('src') || 'unknown'
}

export function detectEpisodeFromPage(): EpisodeMatchResult {
  const candidates = [
    window.location.href,
    document.title,
    document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '',
    document.querySelector('h1')?.textContent ?? '',
  ]
  for (const c of candidates) {
    if (!c) continue
    const result = matchEpisode(c)
    if (result.matched) return result
  }
  return { matched: false, confidence: 0 }
}

export function detectEpisodeFromVideo(video: HTMLVideoElement): EpisodeMatchResult {
  const src = video.src || video.querySelector('source')?.getAttribute('src') || ''
  if (src) {
    const result = matchEpisode(src)
    if (result.matched) return result
  }
  return { matched: false, confidence: 0 }
}

export function getVideoInfo(): VideoInfo {
  const video = detectVideo()
  if (!video) return { element: null as unknown as HTMLVideoElement, episode: null, matched: false }
  let result = detectEpisodeFromPage()
  if (!result.matched) result = detectEpisodeFromVideo(video)
  return {
    element: video,
    episode: result.episode ?? null,
    matched: result.matched,
  }
}
