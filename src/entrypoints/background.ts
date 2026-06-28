import { defineBackground } from '#imports'

export default defineBackground({
  main() {
    chrome.action.onClicked.addListener((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' }).catch(() => {
          // Page doesn't have the content script — nothing to do
        })
      }
    })
  },
})
