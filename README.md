# 🎙️ Loam Dictate

Speak into a note in Obsidian and get clean text at the cursor, on your phone or your desktop, under your own Gemini API key.

<table>
  <tr>
    <td align="center" width="33%"><img src="https://raw.githubusercontent.com/michaelhejazi/loam-dictate/main/docs/images/recording.png" alt="The sheet recording a take, with a timer, a wave, Cancel and Stop" width="100%"><br><sub>Tap, speak</sub></td>
    <td align="center" width="33%"><img src="https://raw.githubusercontent.com/michaelhejazi/loam-dictate/main/docs/images/cleaning.png" alt="The sheet while Gemini cleans up the take" width="100%"><br><sub>Cleaning up</sub></td>
    <td align="center" width="33%"><img src="https://raw.githubusercontent.com/michaelhejazi/loam-dictate/main/docs/images/ready.png" alt="The cleaned text, with Discard, Retake and Insert" width="100%"><br><sub>Press Insert</sub></td>
  </tr>
</table>

[![Latest release](https://img.shields.io/github/v/release/michaelhejazi/loam-dictate?sort=semver)](https://github.com/michaelhejazi/loam-dictate/releases/latest)
[![CI](https://github.com/michaelhejazi/loam-dictate/actions/workflows/ci.yml/badge.svg)](https://github.com/michaelhejazi/loam-dictate/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/github/license/michaelhejazi/loam-dictate)](https://github.com/michaelhejazi/loam-dictate/blob/main/LICENSE)
<!-- Once Obsidian's download stats include the plugin:
[![Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22loam-dictate%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)](https://obsidian.md/plugins?id=loam-dictate)
-->

## How it works

1. **Tap the mic.** The sheet opens and starts recording.
2. **Speak.** Press Stop when you are done; Gemini cleans up the take.
3. **Press Insert.** The words land at the cursor, as one undo step.

## Why this one

- **Cleaned, not transcribed raw.** The ums and false starts go; what you said stays.
- **Names spelled right.** A note in your vault lists the names and terms Gemini should expect.
- **Your key, no account.** The take goes from your device to Google under your own key. There is no Loam account, and the plugin keeps no copy.

## Get started

1. **Install.** In Obsidian, Settings → Community plugins → Browse → search for *Loam Dictate* → Install → Enable. It needs Obsidian 1.13 or later; older Obsidian is offered 0.3.1.
2. **Get a Gemini API key.** Settings → Loam Dictate shows these same steps under the key field:
   1. Open [Google AI Studio's API keys page](https://aistudio.google.com/apikey) and sign in with a Google account.
   2. Select Create API key. The first time, Google asks you to accept its terms of service, and AI Studio may then create a Google Cloud project and a key for you.
   3. Copy the key, paste it into Gemini API key in Loam Dictate's settings, and press Check key.
   4. Treat the key like a password: anyone who has it can use your quota.

   Whether you pay, and how much, is on [Google's Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing).
3. **Put Dictate on the toolbar.** On a phone, Settings → Toolbar → add the global command *Loam Dictate: Dictate*. On a desktop it is on the ribbon and in the command palette.
4. **Take your first take.** Open a note, place the cursor, tap Dictate, speak, press Stop, then Insert.

If Google can't be reached or says no, the sheet says why and keeps the recording, so you can press Try again when you have signal or have fixed the key.

## Your names and terms

Names and terms you want spelled right go in `Dictation terms.md` (the path is a setting), one per line. It syncs with your vault like any note:

```markdown
Simin
Flyo
Loam, Obsidian
- Dr. Okonkwo
Kubernetes
```

Headings, blank lines, `%% comments %%`, frontmatter and list markers are ignored, and a line with commas holds several terms. The note is read afresh on every take, the open note's title and headings are added, and at most 100 terms are sent.

## Settings

| Setting | What it does |
|---|---|
| Gemini API key | Your key. **Check key** asks Google whether the key and model work; it uses no tokens. |
| Model | The Gemini model that transcribes. `gemini-3.5-transcribe` by default. |
| Longest recording | 1–15 minutes, 5 by default. The sheet turns amber thirty seconds before. |
| Names and terms note | The note's path. **Open** opens it, creating it if it is missing. |
| Report a problem | Opens a GitHub issue with the plugin version, Obsidian version, platform and provider filled in. Never your key or a recording. |

## Haptics and the screen

On a phone: one tap when recording starts, two pulses thirty seconds before the longest recording, one long pulse when it stops there; where vibration is missing, a soft tone instead.
The screen stays on while recording, where Obsidian's WebView offers the Screen Wake Lock API.

## Where your recordings and key go

Each recording goes from your device to Google, under your own API key, and
nowhere else. The API key is stored in the plugin's settings file inside the
vault (`.obsidian/plugins/loam-dictate/data.json`), in plain text, as every
plugin's settings are. Anything that syncs or backs up your vault's `.obsidian`
folder carries the key with it.

### Network use

The plugin talks to one service, Google's Gemini API, and only when you ask it to:

- `POST https://generativelanguage.googleapis.com/v1beta/interactions` once per
  take, when you stop a recording or press Try again: the recording in base64,
  your key, the model name, and the names and terms. If Gemini refuses the
  names and terms, the same take is sent once more without them.
- `GET https://generativelanguage.googleapis.com/v1beta/models/<model>` when you
  press Check key: your key and the model name, nothing else.

Both are written down in [docs/gemini-request.md](https://github.com/michaelhejazi/loam-dictate/blob/main/docs/gemini-request.md).
There is no telemetry, no analytics and no other network call. **Report a
problem** only opens a link in your browser; nothing is sent until you submit
the issue yourself.

## Where it is going

Honest about what is not done yet, and where help is welcome:

- **iPhone and iPad.** Untested. iOS records `audio/mp4`, sent to Gemini as `audio/m4a`; someone with an iPhone could prove it end to end.
- **Haptics inside Obsidian.** Unverified on most phones; the plugin can't always tell when a vibration it asked for didn't happen. Reports from your phone help.
- **The warning tone.** Where it replaces vibration, it plays while the microphone is on, so it can end up in the take.
- **Very long takes.** One take is one request, so a long recording can be too large for Gemini; the sheet says so if it happens.
- **More providers.** Transcribing goes through one small interface, so another service can sit beside Gemini.
- **Editing a note by voice.** Saying what to change in a note, not only adding to it. An idea, not started.

## Contributing

Bug reports, fixes and ideas are welcome. Build and test with `npm ci`, `npm run build` and `npm test`; [CONTRIBUTING.md](https://github.com/michaelhejazi/loam-dictate/blob/main/CONTRIBUTING.md) has the rest, including how the code is laid out.
A good place to start is an issue labelled [good first issue](https://github.com/michaelhejazi/loam-dictate/labels/good%20first%20issue) or [help wanted](https://github.com/michaelhejazi/loam-dictate/labels/help%20wanted).
Changes by version are in [CHANGELOG.md](https://github.com/michaelhejazi/loam-dictate/blob/main/CHANGELOG.md); security problems go to [SECURITY.md](https://github.com/michaelhejazi/loam-dictate/blob/main/SECURITY.md), not a public issue.

## Who made it

Loam Dictate was designed by Michael Hejazi and built with an AI engineer
under his direction, which is why the commits carry the engineer's name.

## Licence

MIT, see [LICENSE](https://github.com/michaelhejazi/loam-dictate/blob/main/LICENSE).
