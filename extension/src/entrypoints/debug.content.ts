import { defineContentScript } from '#imports'

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const info = {
      url: window.location.href,
      title: document.title,
      ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? null,
      h1: document.querySelector('h1')?.textContent?.trim() ?? null,
      videos: Array.from(document.querySelectorAll('video')).map((v, i) => ({
        index: i,
        src: v.src || v.querySelector('source')?.getAttribute('src') || '(no src)',
        width: v.videoWidth,
        height: v.videoHeight,
        readyState: v.readyState,
        paused: v.paused,
        currentTime: v.currentTime,
        duration: v.duration,
      })),
      iframes: document.querySelectorAll('iframe').length,
    }

    console.log('=== SkipIntro Debug ===')
    console.log(JSON.stringify(info, null, 2))
    console.log('=======================')

    const panel = document.createElement('div')
    panel.id = 'skip-intro-debug'
    panel.style.cssText = `
      position: fixed; top: 10px; right: 10px; z-index: 999999;
      background: #1a1a2e; color: #e0e0e0; padding: 12px 16px;
      border-radius: 8px; font: 12px/1.5 monospace;
      max-width: 400px; max-height: 80vh; overflow: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      border: 1px solid #333;
    `

    const closeBtn = document.createElement('button')
    closeBtn.textContent = '✕'
    closeBtn.style.cssText = `
      position: absolute; top: 4px; right: 8px;
      background: none; border: none; color: #999;
      cursor: pointer; font-size: 14px;
    `
    closeBtn.onclick = () => panel.remove()

    const title = document.createElement('div')
    title.style.cssText = 'font-weight: bold; font-size: 14px; margin-bottom: 8px; color: #7c3aed;'
    title.textContent = 'SkipIntro Debug'

    const content = document.createElement('div')
    function render() {
      content.innerHTML = `
        <div style="margin-bottom:6px"><span style="color:#888">URL:</span> ${escapeHtml(info.url)}</div>
        <div style="margin-bottom:6px"><span style="color:#888">Title:</span> ${escapeHtml(document.title)}</div>
        <div style="margin-bottom:6px"><span style="color:#888">og:title:</span> ${escapeHtml(info.ogTitle || '(none)')}</div>
        <div style="margin-bottom:6px"><span style="color:#888">h1:</span> ${escapeHtml(info.h1 || '(none)')}</div>
        <div style="margin-bottom:6px"><span style="color:#888">Iframes:</span> ${document.querySelectorAll('iframe').length}</div>
        <div style="margin-top:8px;font-weight:bold;color:${info.videos.length > 0 ? '#34d399' : '#f87171'}">
          Videos: ${info.videos.length}
        </div>
        ${info.videos.length === 0 ? '<div style="color:#f87171;margin-top:4px">No video elements found on page</div>' : ''}
        ${info.videos.map(v => `
          <div style="margin-top:6px;padding:6px;background:#16213e;border-radius:4px">
            <div><span style="color:#888">#${v.index} src:</span> ${escapeHtml(truncate(v.src, 80))}</div>
            <div><span style="color:#888">size:</span> ${v.width}×${v.height}</div>
            <div><span style="color:#888">state:</span> ${v.paused ? '⏸ paused' : '▶ playing'} (readyState=${v.readyState})</div>
            <div><span style="color:#888">time:</span> ${v.currentTime.toFixed(1)}s / ${v.duration.toFixed(1)}s</div>
          </div>
        `).join('')}
      `
    }

    panel.appendChild(closeBtn)
    panel.appendChild(title)
    panel.appendChild(content)
    document.body.appendChild(panel)

    render()
    setInterval(render, 2000)

    function escapeHtml(s: string) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }

    function truncate(s: string, max: number) {
      return s.length > max ? s.slice(0, max) + '...' : s
    }
  },
})
