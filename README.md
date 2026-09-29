# Loam Dictate

An Obsidian plugin for phone and desktop. It records a spoken take, sends it to
the dictation route of your Loam UI server, shows the cleaned words, and inserts
them at the cursor when you press Insert.

The plugin holds no model and no provider key. The server does the transcribing
and the cleaning. The plugin only calls that one route, using an address and a
bearer token that you paste into its settings.

## Network use

The plugin sends one kind of request: `POST <server address>/api/dictate`. The
body is the recording. The request also carries your token and a list of names
and terms: your own list, plus the open note's title and headings. It goes only
to the server address in the plugin's settings, and only when you stop a
recording or press Try again. There is no telemetry and there are no other
network calls. The route's contract is in [docs/dictate-route.md](docs/dictate-route.md).

## Install (BRAT)

Loam Dictate is not in Obsidian's community directory. Install it with
[BRAT](https://github.com/TfTHacker/obsidian42-brat): **Add beta plugin** →
this repository. BRAT installs `main.js`, `manifest.json` and `styles.css` from
the latest GitHub release. The repository is private, so BRAT needs a GitHub
token that can read it. You set that token in BRAT's own settings.

## Use

- **Settings → Loam Dictate**: set the server address and token. You find both
  in Loam UI → Settings → Dictation → Obsidian. Here you can also set the
  longest recording (1–15 minutes, default 5) and your names and terms, one
  per line.
- **Dictate** (the `mic` icon) is an editor command. To put it on the phone's
  toolbar, go to Settings → Toolbar → add the global command
  *Loam Dictate: Dictate*. It is also in the command palette and on the ribbon.
- The sheet records until you press Stop, or until it reaches the longest
  recording. Thirty seconds before that point, it turns amber. Then Loam
  cleans the take and the sheet shows the words. Insert
  puts them at the cursor as one undo step, with a space first if the cursor
  follows a word. Discard, Cancel, closing the sheet or leaving the note all
  throw the take away.
- The screen stays on while recording (the Screen Wake Lock API). Where
  Obsidian's WebView lacks that API, the plugin does nothing about the screen
  and it sleeps on the phone's usual timeout.
- You can tell where the take is without looking. The phone gives one short
  tap when recording starts, two firm pulses thirty seconds before the longest
  recording, and one long pulse when it stops there by itself. A Stop you press
  gets no buzz. The patterns are named in `src/signals.ts`, the same three
  Loam UI's app uses. Where vibration is missing or refused, the two later
  moments play a soft tone instead. Settings → Loam Dictate says which is in
  use on this device.
- If Loam can't be reached, the sheet shows the server's sentence and keeps
  the recording, so you can press Try again when you have signal.

## Build

Needs Node 20 or later (developed on Node 24).

```sh
npm ci
npm run build        # type-checks, then bundles src/ into main.js
```

The build writes `main.js` next to `manifest.json` and `styles.css`. Those are
the three files a vault needs. `npm run dev` rebuilds on every change.

**Bundler: esbuild.** Obsidian's sample plugin uses esbuild, so
`esbuild.config.mjs` follows the sample's setup: a single CommonJS file, with
`obsidian`, Electron and CodeMirror left for the app to provide. Using the same
setup as the sample means Obsidian's documentation applies to this plugin as
written.

## Test

```sh
npm test
```

This type-checks the tests and runs them with Vitest. The tests run against
`test/fake-loam.mjs`, a fake of the dictation route that serves real HTTP on a
local port. They cover:

- the request the plugin builds
- the sentence shown for each error status
- the vocabulary list and its caps
- the spacing rule for inserted words
- the sheet's state machine through every way out, over a fake microphone that
  checks it was released
- the screen wake lock, over a fake one: held while recording, let go on every
  way out, asked for again when the page is shown again mid-take
- the three haptic moments and none on a manual Stop, over a fake `vibrate`,
  and the tone played when `vibrate` is missing or returns `false`

None of this needs a device.

## Try it in a vault

1. Build (see above).
2. Copy `main.js`, `manifest.json` and `styles.css` into
   `<vault>/.obsidian/plugins/loam-dictate/`.
3. In Obsidian, go to Settings → Community plugins, turn community plugins on,
   and enable **Loam Dictate**.
4. Point the plugin's settings at a real Loam UI server, or at the fake route:

   ```sh
   npm run fake      # serves http://127.0.0.1:8787/api/dictate
   ```

   Then set the server address to `http://127.0.0.1:8787` and the token to
   `fake-token-not-a-secret`. The fake answers with a sentence that describes
   the audio it received instead of a transcript. `PORT` and `HOST` change
   where it listens.

## Release

1. `npm version 0.1.1 --no-git-tag-version` updates `package.json`, the
   `manifest.json` version and `versions.json`. `versions.json` maps each
   version to the minimum Obsidian version it needs. Commit.
2. Tag with the manifest version exactly (no `v`) and push the tag:
   `git tag 0.1.1 && git push origin main 0.1.1`.
3. `.github/workflows/release.yml` checks that the tag matches the manifest,
   then tests, builds, and creates the GitHub release with `main.js`,
   `manifest.json` and `styles.css` attached. It then writes the release URL,
   the asset sizes and the SHA-256 of each asset as a git note on the tagged
   commit, which you can read without GitHub access:
   `git fetch origin refs/notes/release:refs/notes/release && git notes --ref=release show 0.1.1`.

## How it is put together

| File | What it does |
|---|---|
| `src/main.ts` | The plugin: the Dictate command and ribbon icon, settings, the note's vocabulary. `makeTranscriber()` is the one place a transcriber is constructed. |
| `src/transcriber.ts` | `Transcriber.transcribe(audio, mimeType, terms) → {text, biased}`, the only thing the sheet knows about cleaning. |
| `src/loam.ts` | `LoamTranscriber`, the one implementation. It calls the route through Obsidian's `requestUrl`, so no browser CORS applies. |
| `src/session.ts` | The sheet's state machine: starting, recording, cleaning, ready, not cleaned, unsupported, closed. It uses no DOM and no Obsidian, so it can be tested on its own. |
| `src/recorder.ts` | `MediaRecorder` over `getUserMedia`. It asks for Opus in WebM at 32 kbit/s where the platform offers it, and the recording's real MIME type is what gets sent. |
| `src/signals.ts` | The three haptic patterns by name (`HAPTICS`), and the soft-tone fallback where vibration isn't felt. |
| `src/wakelock.ts` | `ScreenWake`: keeps the screen on while the session is recording, asking again whenever the page is shown. |
| `src/modal.ts` | The sheet, an Obsidian `Modal`. It draws the session's phase following `design/dictate-sheet.html`. |
| `src/insert.ts`, `src/vocabulary.ts` | The spacing rule and the terms list. |

A second way to transcribe, such as a user's own key, would be a new
`Transcriber` chosen in `makeTranscriber()`. The sheet does not change. A
second verb on the ready card, such as editing the note by voice, would be
another action beside Insert. The session's `ready` phase already carries the
words it would need.

Everything the plugin creates is released when it closes: the microphone, the
screen wake lock, the clock, the drawing loop and the listeners. Unloading the plugin closes any open
sheet.
