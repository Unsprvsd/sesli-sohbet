# Voice Chat App (Discord-like) — Project Plan

## Goal

A small, private voice chat app for a group of friends.
Discord is blocked in our country, so we build our own simple version.
**No server of our own, zero cost** (Option A).

Must have (version 1):
- Rooms (voice channels). Users can see the room list and join one.
- Voice talk in real time inside a room.
- Mute / unmute the microphone.
- See who is in each room, who is muted, and who is speaking right now.
- Simple username (no accounts).
- One shared invite password so strangers cannot get in.

Later (not v1):
- Deafen, per-user volume, text chat, push-to-talk.
- A free TURN service if some friends cannot connect (see "Known risk").
- Fallback plan B: one friend's PC runs a server + Tailscale / Radmin VPN.

## How it works (no own server)

- **Static website** — the app is only HTML/JS files. Hosted free on
  **GitHub Pages** (or Netlify). This gives HTTPS, which browsers need for the mic.
- **WebRTC** — built into browsers. Sends voice directly between users.
- **Trystero** — a library that does WebRTC "signaling" (users finding each
  other) through free public networks (Nostr relays / BitTorrent trackers).
  So we do not run any server.
- **STUN** — Google's free public STUN servers help connect through home routers.
- **Mesh** — everyone in a room connects to everyone else. Good for ~6–8 people
  per room.

### Trystero rooms we use

- **Lobby room** (`lobby`) — everyone joins it after login. Each user
  broadcasts their presence: `{ username, voiceRoom, muted, speaking }`.
  This is how the room list shows who is where, without a server.
- **Voice rooms** (`voice-genel`, `voice-oyun`, `voice-muzik`) — a user joins
  one at a time and sends their mic stream with `room.addStream()`.
- The invite password is passed as Trystero's `password` option. It encrypts
  the connection handshake, so people without the password cannot join.
- `appId` is a fixed unique string for our app.

## Tech stack

| Part      | Choice                                       |
|-----------|----------------------------------------------|
| Language  | TypeScript                                   |
| Frontend  | React + Vite                                 |
| Signaling | Trystero (Nostr strategy, torrent as backup) |
| Voice     | Browser WebRTC via Trystero, mesh            |
| NAT help  | Google public STUN                           |
| Hosting   | GitHub Pages (free, HTTPS)                   |

## Folder structure

```
Discord/
  CLAUDE.md
  index.html
  package.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    lobby.ts         lobby room: presence of all users
    voice.ts         voice room: mic, peers, mute, speaking detection
    components/      Login, RoomList, RoomView, UserTile, Controls
```

## Build phases

1. **Setup** — install Node.js (only for building on this PC), create Vite +
   React project, add Trystero, see the "hello" page.
2. **Login + lobby** — username + password screen, join lobby, show online users.
3. **Voice on localhost** — join a voice room, share mic, hear others.
   Test with two browser tabs / two devices.
4. **Mute/unmute + speaking indicator** — mute = `track.enabled = false`,
   speaking detection with Web Audio API (AnalyserNode volume).
5. **Room list with members** — from lobby presence data.
6. **Publish** — push to GitHub, turn on GitHub Pages, test with friends on
   different connections (home Wi-Fi AND mobile data).
7. **Polish** — reconnect handling, echo cancellation / noise suppression,
   nicer UI.

## Progress

- Phase 1 done. Phase 2 done (tested by user: two tabs see each other).
- Phases 3–5 done (voice, mute, deafen, speaking ring, room members);
  user tested on localhost with two tabs.
- Phase 6: published. Repo https://github.com/Unsprvsd/sesli-sohbet (public),
  live at https://unsprvsd.github.io/sesli-sohbet/ . Every push to `main`
  rebuilds and redeploys via `.github/workflows/deploy.yml`.
  Tested with friends over the internet (2026-11-22): works, no TURN needed so far.
- Phase 7 + text channels tested by user and LIVE (2026-11-22): per-person volume (by name,
  0–100%, via stream metadata `{uid}` = lobby userId), text chat (lobby
  action `chat`, history sent to newcomers, lost when everyone leaves),
  push-to-talk (key + hold button; only works while tab is focused),
  auto-reconnect (online event → rejoin lobby; voice watchdog rejoins with
  15s/30s/60s backoff), mic choice (⚙️ settings, localStorage).
- Text channels (#genel, #oyun, #linkler; ids `txt-*` in config.ts) replace
  the old per-voice-room chat. Layout: sidebar | voice bar + chat | online
  list. Unread badges count messages newer than login / last view.
  Volume = popup under the name in the voice bar. Same-PC two-tab warning
  (BroadcastChannel) to explain feedback ringing.
- Screen sharing live; end-to-end tested by Claude 2026-11-24 with fake mic/screen
  (canvas) in two tabs — share, watch, stop, rewatch, sharer stops/leaves all OK.
  Not yet tested with a real window picker, tab audio, or friends: 🖥️ button in a voice
  room, getDisplayMedia (tab audio yes, system audio excluded to avoid
  echo). Opt-in watching: viewer sends `screen-watch` {uid, watch} in the
  voice room; sharer addStream(screen, {target, metadata:{uid, kind:'screen'}})
  only to watchers. Presence field `sharing`. Phones can watch, not share.
- Servers LIVE (2026-11-24, tested by Claude on localhost):
  login = "Sunucuya katıl" / "Sunucu kur" with server name + password.
  No fixed rooms any more; new server = 1 voice room + 1 text channel.
  Creator = admin: ECDSA private key in their localStorage; channel list
  ("config") is signed, cached by every member, sent to newcomers via
  lobby action `config`. Admin adds/renames/deletes rooms; 👑 via signed
  `adminSig` in presence. Room ids: `s-<key>-lobby`, `voice-<key>-<id>`
  (`key` = short hash of lower-cased name). Code: `src/server.ts`.
- UI language is English (2026-11-24); default rooms "General" / "#general".
- Design "Clean lines" (2026-11-24, see vault/Design.md): white on black, JetBrains
  Mono, no emoji, `<name>` bold in chat, `$`/`#` (admin) prompt, crown, volume bars.
  Text chat = drawer at the bottom of the middle column (25vh), opened by clicking a
  text channel, ▲/▼ toggles it. LIVE.
- Screen share quality presets (480p30 / 720p30 default / 1080p15 / 1080p30 / 1080p60),
  changeable while sharing via applyConstraints. LIVE (2026-11-24).
- Seagull letters picked by SHAPE (2026-11-26, local): shared `src/ascii/shapeAscii.ts`
  (6-part shape vectors, Alex Harri method), `GullPainter` in `src/seagull/engine.ts`,
  settings `render.letters` / `render.shape`; lab has Letters / Set / Contrast + compare.
  See vault/Decisions/020.
- ASCII STUDIO (2026-11-26, local, dev only): http://localhost:5173/ascii-studio.html
  WORKFLOW: user describes an animation in chat → Claude codes it as a scene →
  user tunes knobs / compares A-B / presses "Final" → values saved to
  `src/ascii/final.json` (wins over defaults in code) → app uses them.
  User does NOT want drawing tools (paint editor was rejected and deleted).
  New scene = `src/ascii/scenes/<name>.ts` (settings object + `applyFinal` + start fn)
  + entry with knobs in `src/studio/scenes.ts` + `"<id>": {}` in final.json.
  Save endpoint: dev-only plugin in `vite.config.ts`. See vault/Decisions/022.
  RULE: knob changes are only a preview. A value counts as the user's choice ONLY
  after they press Final AND confirm the "are you sure?" popup (it lists old → new).
  Claude never presses Final / writes final.json for the user, and never treats
  unsaved studio values as decided.
- ASCII spider (2026-11-26, local): climbs the layout lines (.sidebar right edge,
  .people left edge, .sidebar-foot top) now and then, same for everyone (lobby action
  `gull`, types sp-spawn / sp-hit / sp-caught), click = +1 on the gull score.
  `src/ascii/scenes/spider.ts`, `src/components/AsciiSpider.tsx`. vault/Decisions/023.
- Rule: test big changes on localhost BEFORE pushing — friends use the live site.
- Speaking state is self-reported through lobby presence (no peer-id mapping
  between lobby and voice rooms needed).

## ASCII art research (read before any new ASCII visual)

Research on ASCII rendering (2026-11-26) lives in the vault:
`vault/Research/ASCII/` — start with `README.md` (what to use for what).
- `Techniques.md` — ramps, coverage, shape-vector matching (sharp edges), edge
  letters, braille / blocks, dithering, animation ideas, speed tricks
- `Web libraries.md` — textmode.js, p5.asciify, play.core, three.js AsciiEffect, figlet.js
- `Python and other languages.md` — offline tools (Pillow script, ascii_magic,
  pyfiglet, asciimatics, drawille, chafa, ascii-image-converter)
- `Sites and tools.md` — converters (Grainrad), editors (REXPaint), archives
- `Artists and inspiration.md` — artists, coders, games, ideas for the app
Default: own Canvas 2D code, data in its own files (like `src/seagull/`);
a library only if needed and only after the user approves it.

## Known risk

No TURN server. Some users (often on mobile data or strict networks) may fail
to connect directly. Fix if needed: add a free TURN service (with usage
limits) to Trystero's `rtcConfig`, or switch to plan B (Tailscale).

## Project notes (Obsidian vault)

Private notes live in `vault/` (gitignored — never pushed). Start a session by
reading `vault/Todo.md`. At the end of a session:
- add `vault/Log/YYYY-MM-DD.md` (what was done, what's next)
- add a note in `vault/Decisions/` for each new design choice (numbered, see
  `vault/Templates/Decision template.md`)
- add a note in `vault/Bugs/` for each bug or problem (see Bug template)
- update `vault/Todo.md`, `vault/Features.md` and the links in `vault/Home.md`

## Rules for Claude in this project

- User is on Windows 11 with PowerShell. Use PowerShell syntax, not bash.
- Before every shell command, explain in 1–2 simple sentences what it does.
  After it runs, explain what the result means.
- Use clear, simple English (user is Turkish; a short Turkish summary helps).
  Explain new technical words the first time.
- Work one phase at a time. Make it work and test it before the next one.
- Keep it simple. No database, no backend server.
- Never commit secrets (the invite password) into the public repo.
- This PC's global npm `script-shell` is `bash` (points to a broken WSL).
  The project `.npmrc` sets `script-shell=cmd.exe` — keep that file.
