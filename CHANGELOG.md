# Changelog

All notable changes to Loam Dictate are written here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each version is a
GitHub release with `main.js`, `manifest.json` and `styles.css` attached.

## [Unreleased]

## [0.3.2] - 2026-10-01

Needs Obsidian 1.13.0 or later. Obsidian older than that is offered 0.3.1.

### Changed

- The settings are declared through Obsidian 1.13's settings API
  (`getSettingDefinitions()`), so every one of them appears in Obsidian's
  settings search. They look and work as before; the toolbar hint and the
  Alerts line are rows with their own names now, and the Loam server's menu
  path is part of the Server address description.
- The release's three files carry GitHub build provenance attestations.
- The README's links to the licence, the contributing guide, the changelog,
  the security policy and the docs are absolute, so they work on the
  community directory's listing too.
- Release notes say to install or update from Obsidian's community plugins,
  and link the release's attestation.
- The README says who made the plugin and how.
- `package.json`'s `homepage` is the author's GitHub profile, like
  `manifest.json`'s `authorUrl`.
- The README is shorter and leads with three screenshots of the sheet; the
  build, test, layout and release notes moved to CONTRIBUTING.md.

### Fixed

- The cleaning sheet showed the previous take's number of terms (0 on the
  first take). It now shows the number sent with this take
  ([#1](https://github.com/michaelhejazi/loam-dictate/issues/1)).

## [0.3.1] - 2026-10-01

No change to the plugin's behaviour; this release is the first one cut from
the repository's public history.

### Added

- `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md` and `.editorconfig`.
- A feature-request issue template and a pull-request template.
- A CI workflow that runs the lint, the tests and the build on every push and
  pull request.

### Changed

- The README leads with installing from Obsidian's community directory; BRAT
  is one sentence for the time before the listing.
- `package.json` names the repository, issues, homepage, author and keywords.

## [0.3.0] - 2026-10-01

### Added

- **Check key** in the settings: one request for the model's record that
  says whether the key works and the model exists, using no tokens.
- The steps to get a Gemini API key, the same words in the settings and in
  the README.
- **Report a problem**: opens a GitHub issue with the plugin version, the
  Obsidian version, the platform and the provider filled in, never the key.
  An issue template asks for the same four things.
- An MIT licence, and `npm run lint` running eslint-plugin-obsidianmd, the
  checks Obsidian's community directory runs.

### Changed

- A fresh install sees one provider, Gemini with your own key. The self-hosted
  Loam server is offered only where an address or token is already saved.
- The README is written for someone who has never heard of Loam.
- The terms note opens in a tab behind the settings instead of closing them.

### Removed

- The use of Obsidian's private `app.setting.close`.

## [0.2.0] - 2026-09-30

### Added

- **Gemini with your own API key** as a second provider, and the default for a
  fresh install: the take goes to Gemini's Interactions API in smart mode,
  with the names and terms as custom vocabulary. If Gemini refuses the
  vocabulary, the take is sent once more without it.
- Names and terms live in a vault note, `Dictation terms.md` by default, read
  afresh on every take, with an **Open** button that creates it if missing.

### Changed

- An install from 0.1 with a Loam server saved stays on Loam. Its terms move
  into the note if the note is missing; otherwise the settings offer **Add to
  note** or **Forget**.

### Removed

- The list of terms inside the settings.

## [0.1.1] - 2026-09-29

### Added

- The screen stays on while recording, through the Screen Wake Lock API.
- Haptics for three moments: a tap when recording starts, two pulses thirty
  seconds before the longest recording, one long pulse when it stops there.
  Where vibration is missing or refused, the later two play a soft tone.
  The settings say which is in use.

## [0.1.0] - 2026-09-28

### Added

- The Dictate command and ribbon icon, opening a sheet that records a take,
  sends it to a Loam server's dictation route, shows the cleaned words and
  inserts them at the cursor as one undo step.
- A longest recording setting, with an amber warning thirty seconds before it.
- Retake, Discard and Try again; a failed take is kept with a sentence saying
  why.

[Unreleased]: https://github.com/michaelhejazi/loam-dictate/compare/0.3.2...HEAD
[0.3.2]: https://github.com/michaelhejazi/loam-dictate/compare/0.3.1...0.3.2
[0.3.1]: https://github.com/michaelhejazi/loam-dictate/compare/0.3.0...0.3.1
[0.3.0]: https://github.com/michaelhejazi/loam-dictate/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/michaelhejazi/loam-dictate/compare/0.1.1...0.2.0
[0.1.1]: https://github.com/michaelhejazi/loam-dictate/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/michaelhejazi/loam-dictate/releases/tag/0.1.0
