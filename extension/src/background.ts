import { getConfig, getTimestamps, saveTimestamp } from './lib/storage'
import { DesktopClient } from './lib/ws-client'

const desktop = new DesktopClient()

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'get-config':
      getConfig().then(sendResponse)
      return true
    case 'save-config':
      getConfig().then(async () => {
        await chrome.storage.local.set({ 'skip-intro-config': msg.config })
        sendResponse({})
      })
      return true
    case 'get-timestamps':
      getTimestamps().then(sendResponse)
      return true
    case 'save-timestamp':
      saveTimestamp(msg.episodeId as string, msg.start as number, msg.end as number).then(sendResponse)
      return true
    case 'connect-desktop':
      desktop.connect()
      sendResponse({ status: desktop.getStatus() })
      return true
    case 'desktop-status':
      sendResponse({ status: desktop.getStatus() })
      return true
    case 'get-shows':
      chrome.storage.local.get('skip-intro-shows').then(r => sendResponse(r['skip-intro-shows'] ?? []))
      return true
    case 'add-show':
      chrome.storage.local.get('skip-intro-shows').then(r => {
        const shows: string[] = r['skip-intro-shows'] ?? []
        if (!shows.includes(msg.name)) {
          shows.push(msg.name)
          chrome.storage.local.set({ 'skip-intro-shows': shows })
        }
        sendResponse({})
      })
      return true
  }
})

getConfig().then(config => {
  if (config.desktopEnabled) desktop.connect()
})
