import { defineBackground } from '#imports'
import { getConfig, saveConfig, getTimestamps, saveTimestamp } from '../lib/storage'
import { DesktopClient } from '../lib/ws-client'
import type { Config } from '@skip-intro/core'

export default defineBackground({
  main() {
    const desktop = new DesktopClient()

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      switch (msg.type) {
        case 'get-config':
          getConfig().then(sendResponse)
          return true
        case 'save-config':
          saveConfig(msg.config as Config).then(sendResponse)
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
        case 'fingerprint':
          desktop.send('fingerprint', { episodeId: msg.episodeId, position: msg.position })
          sendResponse({})
          return true
      }
    })

    desktop.on('fingerprint-result', (data) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, data).catch(() => { })
        }
      })
    })

    getConfig().then(config => {
      if (config.desktopEnabled) {
        desktop.connect()
      }
    })
  },
})
