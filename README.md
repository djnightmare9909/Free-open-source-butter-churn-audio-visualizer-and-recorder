🎛️ Milkdrop Visualizer

Real-time audio-reactive visuals, right in your browser. No subscriptions. No cloud. Just math and music.

Upload any MP3 or WAV and watch classic Milkdrop-style presets react to your audio in real time. Built with React and Butterchurn—the WebAssembly port of the legendary Winamp visualizer.

Record your session with one tap and export as a WebM video. Perfect for music videos, live streams, or just zoning out.

---

✨ Features

· 200+ presets – Geiss, Funk, and all the classics
· Random or Sequential playback modes
· Custom playlists – build your own favorites list
· Built-in video recorder – captures canvas + audio simultaneously
· One-handed controls – ergonomic docked UI, mobile-friendly
· 100% local – everything runs in your browser. No uploads, no servers.

---

🚀 Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000 – drop in a track and go.

---

🎮 How It Works

Button Action
Load Upload your MP3 or WAV
Play Start / pause the music
◀ ▶ Skip between presets
Rec Start / stop video recording (auto-downloads on stop)

Pull up the bottom panel to toggle Random/Sequential mode or manage your playlist.

---

🛠️ Tech

· React 19 + TypeScript
· Vite 6
· Butterchurn (Milkdrop engine)
· TailwindCSS 4
· Web Audio API + MediaRecorder API
