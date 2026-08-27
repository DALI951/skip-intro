# SkipIntro

A Chrome (MV3) browser extension built with **WXT + React + TypeScript** that **automatically skips anime/series intros** on streaming websites.

> TypeScript · WXT · React · Manifest V3 · scripts in the page through a WebSocket bridge

---

## What it does

While you watch anime/series, SkipIntro detects when an intro/recap segment plays and **skips past it automatically** (or shows a small overlay / listens for skip signals), across any site via `<all_urls>`.

## Architecture

The extension uses the **WXT** framework (Vite under the hood):

```
extension/
  background/          service worker (background.ts)
  content/             content scripts (content.ts, debug.content.ts)
  components/          React UI (App.tsx, popup at index.html)
  lib/                 episode-detector.ts, storage.ts, ws-client.ts
  manifest.json        MV3, storage + activeTab + scripting, all_urls
  build.mjs, generate-icons.mjs
```

The key idea is a **WebSocket client** (`ws-client.ts`) that talks to an external skip server, plus an **episode detector** to figure out when an intro begins so the extension can act.

## Build

```bash
npm install
npm run dev    # watch + reload in Chrome
npm run build  # produce the unpacked extension (out/)
```

Load the `out/` (or `.output`) folder via **chrome://extensions → Load unpacked**.

## Repo layout

```
extension/   WXT source (background, content, React UI, lib)
icons/       16 / 48 / 128 px
```

> Note: node_modules artifacts (vite, esbuild) are committed in this clone; the actual source lives under `extension/`.
