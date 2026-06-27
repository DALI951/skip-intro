import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  manifest: {
    name: 'SkipIntro',
    description: 'Automatically skip anime/series intros on any website',
    version: '0.1.0',
    icons: {
      16: '/icons/16.png',
      48: '/icons/48.png',
      128: '/icons/128.png',
    },
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: ['<all_urls>'],
    optional_host_permissions: ['<all_urls>'],
  },
})
