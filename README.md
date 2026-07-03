# Skip Intro — Browser Extension

A Chrome/Edge browser extension (Manifest V3) that lets users skip video intros by saving custom skip durations per show. Auto-detects shows and adds a skip button to video players.

## Features

- **Custom Skip Durations** — Save skip length in seconds per show
- **Timestamp Mode** — Set start/end timestamps for precise skipping
- **Show Auto-Detection** — Detects show name from URL and page title
- **Persistent Storage** — Saved skips stored in chrome.storage.local
- **Floating Panel** — Draggable panel for managing skips
- **Video Hover Button** — Skip button appears when hovering the video
- **Auto-Skip** — Automatically skip on page load (default 90s)
- **Iframe Support** — Broadcasts skip data to embedded video players
- **Arabic Support** — Arabic title detection patterns

## Tech Stack

- **Framework:** WXT (Web Extension Tools, v0.20)
- **Language:** TypeScript
- **Manifest:** Chrome Extension Manifest V3

## Installation (Development)

`ash
npm install
npm run dev     # Hot-reload development
npm run build   # Production build
`

Then load the output/ directory as an unpacked extension in Chrome/Edge.

## What's Missing / Future Improvements

- [ ] Cloud sync for skip profiles across devices
- [ ] Community-shared skip timestamps database
- [ ] Automatic intro detection (audio waveform analysis)
- [ ] Support for more streaming platforms
- [ ] Bulk editing and import/export of skips
- [ ] Keyboard shortcuts for skip management
- [ ] Statistics (time saved by skipping intros)
- [ ] Firefox port
- [ ] Settings page with advanced options
