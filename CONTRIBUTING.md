# Contributing to Loam Dictate

Thank you for wanting to help. Bug reports, fixes and small improvements are
all welcome. For anything larger than a fix, please open an issue first so we
can agree on the shape before you spend the time.

## Build, test, lint

Needs Node 20 or later (developed on Node 24).

```sh
npm ci
npm run build    # type-checks src/, then bundles it into main.js
npm test         # type-checks the tests, then runs them with Vitest
npm run lint     # eslint-plugin-obsidianmd, the community directory's checks
```

CI runs all three on every push and pull request
(`.github/workflows/ci.yml`). The tests need no device, no microphone and no
network: the transcribers are tested against fakes that serve real HTTP on a
local port (`test/fake-gemini.mjs`, `test/fake-loam.mjs`), and the
microphone, wake lock and vibration are fakes too.

`npm run lint` must report no errors. Its warnings are kept on purpose and
explained in [docs/submission.md](docs/submission.md); a new warning needs a
reason there too.

## Try it in a vault

Use a test vault, not the one you keep your notes in.

1. `npm run build` (or `npm run dev` to rebuild on every change).
2. Copy `main.js`, `manifest.json` and `styles.css` into
   `<vault>/.obsidian/plugins/loam-dictate/`. A symlink of the repository to
   that folder saves copying each time.
3. In Obsidian, Settings → Community plugins → enable **Loam Dictate**.

Without a Gemini key, run the fake self-hosted route:

```sh
npm run fake     # serves http://127.0.0.1:8787/api/dictate
```

With Obsidian closed, put
`{"server": "http://127.0.0.1:8787", "token": "fake-token-not-a-secret"}` in
`<vault>/.obsidian/plugins/loam-dictate/data.json`. The settings then offer
**A Loam server** under **Transcribe with**, and the fake answers each take
with a sentence describing the audio it received.

## Where things are written

Some things are written in exactly one place, and everything else reads them
from there. Change them there and nowhere else:

- **The haptic patterns**: `HAPTICS` in `src/signals.ts` (started, warning,
  cap), with the tone that replaces them where vibration isn't felt.
- **The names and terms**: what counts as a term in the note is
  `src/termsnote.ts`; how many are sent, and how long each may be, is
  `src/vocabulary.ts`.
- **The steps to a Gemini key**: `KEY_STEPS` and `KEY_PRICING` in
  `src/settings.ts`. The README repeats them, and a test fails if the two
  differ.

`src/session.ts`, the sheet's state machine, imports neither the DOM nor
`obsidian`, which is what lets every way out of a take be tested in Node.
Please keep it that way. The README's *How it is put together* table says
what each file does.

## A good pull request

- One change, with a title that says what it does for someone using the
  plugin.
- Tests for the behaviour it changes, and `npm test`, `npm run lint` and
  `npm run build` passing.
- The README updated where it describes what you changed, and a line under
  *Unreleased* in [CHANGELOG.md](CHANGELOG.md).
- Works on mobile: no Node or Electron APIs, no inline styles, no regex
  lookbehind (older iOS), as Obsidian's
  [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
  ask.
- No keys, tokens or server addresses anywhere: in code, tests, screenshots or
  the description. The fakes' credentials are fixtures that say they are not
  secrets.

If a change touches the requests to Gemini or to a Loam server, update the
contract in `docs/gemini-request.md` or `docs/dictate-route.md` and the fake
that implements it.

## Releases

Releases are cut by the maintainer: the README's *Release* section has the
steps.
