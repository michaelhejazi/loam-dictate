# Loam Dictate

Loam Dictate lets you dictate into your notes in Obsidian, on a phone or a
desktop. You speak, Google's Gemini turns the recording into clean text under
your own API key, and you insert the words at the cursor.

The plugin holds no model and needs no account other than Google's. It is
open source under the MIT licence ([LICENSE](LICENSE)).

## Install

- **From Obsidian's community directory**, once it is listed there: Settings →
  Community plugins → Browse → search for *Loam Dictate* → Install → Enable.
- **Until then, with [BRAT](https://github.com/TfTHacker/obsidian42-brat)**:
  install and enable BRAT, then use its **Add beta plugin** with
  `michaelhejazi/loam-dictate`. BRAT installs `main.js`, `manifest.json` and
  `styles.css` from the latest GitHub release and keeps them up to date. While
  the repository is private, BRAT also needs a GitHub token that can read it,
  set in BRAT's own settings.

## Get a Gemini API key

The plugin sends your recordings to Google under a key you create yourself.
Settings → Loam Dictate shows these same steps under the key field:

1. Open [Google AI Studio's API keys page](https://aistudio.google.com/apikey) and sign in with a Google account.
2. Select Create API key. The first time, Google asks you to accept its terms of service, and AI Studio may then create a Google Cloud project and a key for you.
3. Copy the key, paste it into Gemini API key in Loam Dictate's settings, and press Check key.
4. Treat the key like a password: anyone who has it can use your quota.

Whether you pay, and how much, is on [Google's Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing).

**Check key**, beside the key field, asks Google for the record of the model in
the Model setting, once, and says what it found: the key works and the model
exists, Google refused the key, there is no such model, or Google couldn't be
reached. That request uses no tokens.

## Use

- **Dictate** (the `mic` icon) is an editor command. It is in the command
  palette and on the ribbon. To put it on the phone's toolbar, go to Settings →
  Toolbar → add the global command *Loam Dictate: Dictate*.
- The sheet records until you press Stop, or until it reaches the longest
  recording (a setting, 1–15 minutes, 5 by default). Thirty seconds before that
  point it turns amber. Then Gemini transcribes the take and the sheet shows
  the words. **Insert** puts them at the cursor as one undo step, with a space
  first if the cursor follows a word. Discard, Cancel, closing the sheet or
  leaving the note all throw the take away.
- If Google can't be reached or says no, the sheet shows a sentence saying why
  and keeps the recording, so you can press Try again when you have signal or
  have fixed the key.
- The screen stays on while recording, where Obsidian's WebView offers the
  Screen Wake Lock API.
- On a phone you can tell where the take is without looking: one short tap
  when recording starts, two firm pulses thirty seconds before the longest
  recording, and one long pulse when it stops there by itself. A Stop you press
  gets no buzz. Where vibration is missing or refused, the two later moments
  play a soft tone instead. Settings → Loam Dictate says which is in use.

### Names and terms

Names and terms you want spelled right live in a note in your vault,
`Dictation terms.md` by default (the path is a setting), so they sync with the
vault and can be edited anywhere. **Open** in the settings opens it in a new
tab, creating it if it is missing; close the settings to see it. Write one term
per line; a line with commas holds several. Frontmatter, headings, blank lines,
`%% comments %%` and list markers (`-`, `*`, `1.`, `- [ ]`) are ignored. The
note is read afresh on every take, and the open note's title and headings are
added after it. Each term counts once, and at most 100 are sent.

## Where your recordings and key go

Each recording goes from your device to Google, under your own API key, and
nowhere else. The API key is stored in the plugin's settings file inside the
vault (`.obsidian/plugins/loam-dictate/data.json`), in plain text, as every
plugin's settings are. Anything that syncs or backs up your vault's `.obsidian`
folder carries the key with it.

## Network use

The plugin talks to one service, Google's Gemini API, and only when you ask it
to:

- `POST https://generativelanguage.googleapis.com/v1beta/interactions` once per
  take, when you stop a recording or press Try again: the recording in base64,
  your key, the model name, and the names and terms. If Gemini refuses the
  names and terms, the same take is sent once more without them.
- `GET https://generativelanguage.googleapis.com/v1beta/models/<model>` when you
  press Check key: your key and the model name, nothing else.

Both are written down in [docs/gemini-request.md](docs/gemini-request.md).
There is no telemetry, no analytics and no other network call. **Report a
problem** only opens a link in your browser; nothing is sent until you submit
the issue yourself.

## Report a problem

Settings → Loam Dictate → **Report a problem** opens a new
[GitHub issue](https://github.com/michaelhejazi/loam-dictate/issues) on this
repository with four things filled in: the plugin version, the Obsidian
version, the platform (desktop or mobile, and the OS) and the provider. It
never includes your key or a recording. Add what happened, and please don't
paste your key.

## Known limits

- **iPhone and iPad are untested.** iOS records `audio/mp4`, which the plugin
  sends to Gemini as `audio/m4a`. That has not been tried against Gemini on a
  real iPhone.
- **Haptics inside Obsidian are unverified.** Whether a phone vibrates for
  Obsidian depends on the app's permissions, and the plugin can't always tell
  when a vibration it asked for didn't happen.
- **The warning tone can be heard in the recording.** Where vibration is
  unavailable, the soft tone thirty seconds before the end plays while the
  microphone is still on, so it may end up in the take.
- One take is one request, so a very long recording can be too large for
  Gemini to accept in one go; the sheet says so if it happens.

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
tested against fakes that serve real HTTP on a local port:
`test/fake-gemini.mjs`, a fake of Gemini's interactions endpoint and model
records (its key is `fake-gemini-key-not-a-secret`), and `test/fake-loam.mjs`,
a fake of the self-hosted route described below. They cover:

- the request each provider builds: for Gemini, the JSON body with and without
  terms, the base64 audio and the MIME mapping for WebM and MP4
- the sentence shown for each error, and Gemini's vocabulary fallback
- Check key's request and its outcomes: the key works, refused, unknown model,
  Google unreachable
- which providers the settings tab offers on a fresh install and on one with a
  self-hosted server saved, over a stand-in for Obsidian's `Setting`
- the Report a problem link's body, and that it never carries a key, token or
  address
- opening the terms note without Obsidian's private settings API
- the terms note parsed from `test/fixtures/Dictation terms.md`, the vocabulary
  list and its caps, and the move from 0.1's settings
- the spacing rule for inserted words
- the sheet's state machine through every way out, over a fake microphone that
  checks it was released
- the screen wake lock and the three haptic moments, over fakes

None of this needs a device.

```sh
npm run lint
```

runs [eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin),
the checks Obsidian's community directory runs on a submission. It reports no
errors; the warnings it leaves, and why, are in
[docs/submission.md](docs/submission.md).

## Try it in a vault

1. Build (see above).
2. Copy `main.js`, `manifest.json` and `styles.css` into
   `<vault>/.obsidian/plugins/loam-dictate/`.
3. In Obsidian, go to Settings → Community plugins, turn community plugins on,
   and enable **Loam Dictate**.
4. Paste a real Gemini API key in its settings and press Check key.

To try it without a key, against the fake self-hosted route:

```sh
npm run fake      # serves http://127.0.0.1:8787/api/dictate
```

With Obsidian closed, put
`{"server": "http://127.0.0.1:8787", "token": "fake-token-not-a-secret"}` in
`<vault>/.obsidian/plugins/loam-dictate/data.json`. The settings then offer a
second provider under **Transcribe with**. The fake answers with a sentence
that describes the audio it received instead of a transcript. `PORT` and
`HOST` change where it listens.

## Release

1. `npm version 0.3.0 --no-git-tag-version` updates `package.json`, the
   `manifest.json` version and `versions.json`. `versions.json` maps each
   version to the minimum Obsidian version it needs. Commit.
2. Tag with the manifest version exactly (no `v`) and push the tag:
   `git tag 0.3.0 && git push origin main 0.3.0`.
3. `.github/workflows/release.yml` checks that the tag matches the manifest,
   then tests, builds, and creates the GitHub release with `main.js`,
   `manifest.json` and `styles.css` attached. It then writes the release URL,
   the asset sizes and the SHA-256 of each asset as a git note on the tagged
   commit, which you can read without GitHub access:
   `git fetch origin refs/notes/release:refs/notes/release && git notes --ref=release show 0.3.0`.

Submitting to Obsidian's community directory is a few minutes by hand on
community.obsidian.md; [docs/submission.md](docs/submission.md) has the entry
and the steps.

## How it is put together

| File | What it does |
|---|---|
| `src/main.ts` | The plugin: the Dictate command and ribbon icon, settings, reading the terms note through the vault, Check key and the Report a problem link. |
| `src/transcriber.ts` | `Transcriber.transcribe(audio, mimeType, terms) → {text, biased}`, the only thing the sheet knows about transcribing. |
| `src/provider.ts` | The provider setting, which providers the settings offer, and `makeTranscriber()`, the one place a transcriber is constructed. |
| `src/gemini.ts` | `GeminiTranscriber`: the take to Gemini's Interactions API under the user's key. |
| `src/keycheck.ts` | Check key: one GET for the model's record, and what the answer means. |
| `src/loam.ts` | `LoamTranscriber`: a second provider, the take to a self-hosted server's dictation route ([docs/dictate-route.md](docs/dictate-route.md)). The settings offer it only where a server address or token is already saved. |
| `src/http.ts` | What the requests share: Obsidian's `requestUrl` (so no browser CORS applies) and the wait. |
| `src/feedback.ts` | The Report a problem link and its four facts. |
| `src/settings.ts` | The settings, their upgrade from 0.1, the settings tab and the key steps. |
| `src/termsnote.ts` | The terms note: parsing it, creating it, moving 0.1's list into it. |
| `src/session.ts` | The sheet's state machine: starting, recording, cleaning, ready, not cleaned, unsupported, closed. It uses no DOM and no Obsidian, so it can be tested on its own. |
| `src/recorder.ts` | `MediaRecorder` over `getUserMedia`. It asks for Opus in WebM at 32 kbit/s where the platform offers it, and the recording's real MIME type is what gets sent. |
| `src/signals.ts` | The three haptic patterns by name (`HAPTICS`), and the soft-tone fallback where vibration isn't felt. |
| `src/wakelock.ts` | `ScreenWake`: keeps the screen on while the session is recording, asking again whenever the page is shown. |
| `src/modal.ts` | The sheet, an Obsidian `Modal`. It draws the session's phase following `design/dictate-sheet.html`. |
| `src/insert.ts`, `src/vocabulary.ts` | The spacing rule and the terms list. |

Another way to transcribe, such as a hosted service, is another `Transcriber`
chosen in `makeTranscriber()` and offered in `visibleProviders()`. The sheet
does not change.

Everything the plugin creates is released when it closes: the microphone, the
screen wake lock, the clock, the drawing loop and the listeners. Unloading the
plugin closes any open sheet.
