import { defineBackground } from '#imports'

export default defineBackground({
  main() {
    // Currently unused — floating VD button in content script handles showing the panel.
    // Keeping this as a potential entry point for future keyboard shortcut / toolbar icon use.
    chrome.action.onClicked.addListener(() => {})
  },
})
