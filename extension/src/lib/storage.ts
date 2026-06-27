import type { Config } from '@skip-intro/core'
import { DEFAULT_CONFIG } from '@skip-intro/core'

export interface ExtensionState {
  config: Config
  desktopConnected: boolean
  currentEpisodeId: string | null
  skipAvailable: boolean
}

const STORAGE_KEYS = {
  CONFIG: 'skip-intro-config',
  TIMESTAMPS: 'skip-intro-timestamps',
  SHOWS: 'skip-intro-shows',
  FINGERPRINTS: 'skip-intro-fingerprints',
  STATE: 'skip-intro-state',
} as const

export async function getConfig(): Promise<Config> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CONFIG)
  return result[STORAGE_KEYS.CONFIG] ?? DEFAULT_CONFIG
}

export async function saveConfig(config: Config): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: config })
}

export async function getState(): Promise<Partial<ExtensionState>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.STATE)
  return result[STORAGE_KEYS.STATE] ?? {}
}

export async function saveState(state: Partial<ExtensionState>): Promise<void> {
  const current = await getState()
  await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: { ...current, ...state } })
}

export async function getTimestamps(): Promise<Record<string, { start: number; end: number }>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TIMESTAMPS)
  return result[STORAGE_KEYS.TIMESTAMPS] ?? {}
}

export async function saveTimestamp(episodeId: string, start: number, end: number): Promise<void> {
  const timestamps = await getTimestamps()
  timestamps[episodeId] = { start, end }
  await chrome.storage.local.set({ [STORAGE_KEYS.TIMESTAMPS]: timestamps })
}

export async function getShows(): Promise<string[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SHOWS)
  return result[STORAGE_KEYS.SHOWS] ?? []
}

export async function addShow(name: string): Promise<void> {
  const shows = await getShows()
  if (!shows.includes(name)) {
    shows.push(name)
    await chrome.storage.local.set({ [STORAGE_KEYS.SHOWS]: shows })
  }
}
