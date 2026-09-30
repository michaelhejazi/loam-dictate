# Loam Dictate

An Obsidian plugin for phone and desktop. It records a spoken take, has it
transcribed, shows the cleaned words, and inserts them at the cursor when you
press Insert.

It holds no model. Two providers do the transcribing, chosen in its settings:

- **Gemini, your own key**: the plugin sends the take straight to Google's
  Gemini API with an API key you paste in. This is the default for a new
  install.
- **A Loam server**: the plugin sends the take to the dictation route of a
  Loam UI server, with its address and a bearer token.

## Where your recordings and key go

With the Gemini provider, each recording goes from your device to Google, under
your own API key, and nowhere else. With a Loam server, it goes to that server
and nowhere else. The API key or token is stored in the plugin's settings file
inside the vault (`.obsidian/plugins/loam-dictate/data.json`), in plain text,
as every plugin's settings are. Anything that syncs or backs up your vault's
`.obsidian` folder carries the key with it.

## Network use

The plugin sends one request per take, only when you stop a recording or press
Try again, to the chosen provider:

- Gemini: `POST https://generativelanguage.googleapis.com/v1beta/interactions`
  with the recording in base64, your key, the model name and the names and
  terms. Written down in [docs/gemini-request.md](docs/gemini-request.md). If
  Gemini refuses the names and terms, the same take is sent once more without
  them.
- Loam: `POST <server address>/api/dictate` with the recording, your token and
  the names and terms. Written down in [docs/dictate-route.md](docs/dictate-route.md).

The names and terms are those in your terms note, plus the open note's title
and headings. There is no telemetry and there are no other network calls.

## Install (BRAT)

Loam Dictate is not in Obsidian's community directory. Install it with
[BRAT](https://github.com/TfTHacker/obsidian42-brat): **Add beta plugin** →
this repository. BRAT installs `main.js`, `manifest.json` and `styles.css` from
the latest GitHub release. The repository is private, so BRAT needs a GitHub
token that can read it. You set that token in BRAT's own settings.

## Use

- **Settings → Loam Dictate**: choose who transcribes. For Gemini, paste an
  API key from [Google AI Studio](https://aistudio.google.com) (Get API key);
  the model defaults to `gemini-3.5-transcribe`, Google's speech-to-text model.
  For a Loam server, set the server address and token; you find both in Loam
  UI → Settings → Dictation → Obsidian. Here you also set the longest
  recording (1–15 minutes, default 5).
- **Names and terms** you want spelled right live in a note in the vault,
  `Dictation terms.md` by default (the path is a setting), so they sync with
  the vault and can be edited anywhere. **Open** in the settings opens it,
  creating it if it is missing. Write one term per line; a line with commas
  holds several. Frontmatter, headings, blank lines, `%% comments %%` and
  list markers (`-`, `*`, `1.`, `- [ ]`) are ignored. The note is read afresh
  on every take, and the open note's title and headings are added after it.
  Each term counts once, and at most 100 are sent.
- **Dictate** (the `mic` icon) is an editor command. To put it on the phone's
  toolbar, go to Settings → Toolbar → add the global command
  *Loam Dictate: Dictate*. It is also in the command palette and on the ribbon.
- The sheet records until you press Stop, or until it reaches the longest
  recording. Thirty seconds before that point, it turns amber. Then the provider
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
- If the provider can't be reached or says no, the sheet shows a sentence
  saying why and keeps the recording, so you can press Try again when you
  have signal or have fixed the key.

### Updating from 0.1

An install that already has a Loam server address or token stays on the Loam
provider; nothing needs touching. Names and terms that 0.1 kept in the
settings move into the terms note the first time 0.2 loads, if that note
doesn't exist yet, and a notice says so. If the note already exists, neither
is changed: the old list stays in the settings, unused, and Settings → Loam
Dictate offers **Add to note** or **Forget**.

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

This type-checks the tests and runs them with Vitest. The transcribers are
tested against two fakes that serve real HTTP on a local port:
`test/fake-loam.mjs`, a fake of Loam's dictation route, and
`test/fake-gemini.mjs`, a fake of Gemini's interactions endpoint (its key is
`fake-gemini-key-not-a-secret`). They cover:

- the request each provider builds: for Gemini, the JSON body with and without
  terms, the base64 audio and the MIME mapping for WebM and MP4
- the sentence shown for each error, and Gemini's vocabulary fallback
- the terms note parsed from `test/fixtures/Dictation terms.md`, the vocabulary
  list and its caps
- the move from 0.1's settings: the provider, and the terms into the note
- the settings tab showing each provider's fields, over a stand-in for
  Obsidian's `Setting`, and the provider constructing the right class
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
4. Choose Gemini and paste a real API key, or choose a Loam server and point
   it at a real Loam UI server or at the fake route:

   ```sh
   npm run fake      # serves http://127.0.0.1:8787/api/dictate
   ```

   Then set the server address to `http://127.0.0.1:8787` and the token to
   `fake-token-not-a-secret`. The fake answers with a sentence that describes
   the audio it received instead of a transcript. `PORT` and `HOST` change
   where it listens.

## Release

1. `npm version 0.2.0 --no-git-tag-version` updates `package.json`, the
   `manifest.json` version and `versions.json`. `versions.json` maps each
   version to the minimum Obsidian version it needs. Commit.
2. Tag with the manifest version exactly (no `v`) and push the tag:
   `git tag 0.2.0 && git push origin main 0.2.0`.
3. `.github/workflows/release.yml` checks that the tag matches the manifest,
   then tests, builds, and creates the GitHub release with `main.js`,
   `manifest.json` and `styles.css` attached. It then writes the release URL,
   the asset sizes and the SHA-256 of each asset as a git note on the tagged
   commit, which you can read without GitHub access:
   `git fetch origin refs/notes/release:refs/notes/release && git notes --ref=release show 0.2.0`.

## How it is put together

| File | What it does |
|---|---|
| `src/main.ts` | The plugin: the Dictate command and ribbon icon, settings, reading the terms note through the vault. |
| `src/transcriber.ts` | `Transcriber.transcribe(audio, mimeType, terms) → {text, biased}`, the only thing the sheet knows about cleaning. |
| `src/provider.ts` | The provider setting and `makeTranscriber()`, the one place a transcriber is constructed. |
| `src/gemini.ts` | `GeminiTranscriber`: the take to Gemini's Interactions API under the user's key. |
| `src/loam.ts` | `LoamTranscriber`: the take to a Loam server's dictation route. |
| `src/http.ts` | What both use of Obsidian's `requestUrl` (so no browser CORS applies), and the 150 s wait. |
| `src/settings.ts` | The settings, their upgrade from 0.1, and the settings tab. |
| `src/termsnote.ts` | The terms note: parsing it, creating it, moving 0.1's list into it. |
| `src/session.ts` | The sheet's state machine: starting, recording, cleaning, ready, not cleaned, unsupported, closed. It uses no DOM and no Obsidian, so it can be tested on its own. |
| `src/recorder.ts` | `MediaRecorder` over `getUserMedia`. It asks for Opus in WebM at 32 kbit/s where the platform offers it, and the recording's real MIME type is what gets sent. |
| `src/signals.ts` | The three haptic patterns by name (`HAPTICS`), and the soft-tone fallback where vibration isn't felt. |
| `src/wakelock.ts` | `ScreenWake`: keeps the screen on while the session is recording, asking again whenever the page is shown. |
| `src/modal.ts` | The sheet, an Obsidian `Modal`. It draws the session's phase following `design/dictate-sheet.html`. |
| `src/insert.ts`, `src/vocabulary.ts` | The spacing rule and the terms list. |

Another way to transcribe, such as a hosted Loam, is another `Transcriber`
chosen in `makeTranscriber()`. The sheet does not change. A
second verb on the ready card, such as editing the note by voice, would be
another action beside Insert. The session's `ready` phase already carries the
words it would need.

Everything the plugin creates is released when it closes: the microphone, the
screen wake lock, the clock, the drawing loop and the listeners. Unloading the plugin closes any open
sheet.
