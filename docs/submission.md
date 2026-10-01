# Spoken: what is left to do by hand

The plugin was renamed from Loam Dictate to Spoken in 0.4.0, and its id from
`loam-dictate` to `spoken`. Obsidian locks a plugin's id once it is listed, so
the directory's `loam-dictate` entry goes and the plugin is submitted again
under the new id. The repository is ready for that; what follows is the
owner's, in order, because each step needs his accounts.

Obsidian's directory docs were read on 2026-10-01
([Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin),
[Set up and claim](https://docs.obsidian.md/community-directory/set-up-and-claim),
[Manage your plugin or theme](https://docs.obsidian.md/community-directory/manage-entry),
[FAQ](https://docs.obsidian.md/community-directory/faq),
[Developer policies](https://docs.obsidian.md/community-directory/developer-policies),
[Submission requirements for plugins](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins),
[Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)).
Submission is a form on community.obsidian.md, and the directory reads the
rest from `manifest.json` at the head of `main`.

## The steps

1. **Rename the repository** to `spoken`, if it is still
   `michaelhejazi/loam-dictate`: on GitHub, the repository's **Settings** →
   **General** → **Repository name** → `spoken` → **Rename**. Then set the
   About description (step 7).
2. **Archive the old entry.** On [community.obsidian.md](https://community.obsidian.md),
   signed in, go to **Plugins**, open the `loam-dictate` entry, and archive it
   from its **...** menu.
3. **Submit the new one.** **Plugins** → **New plugin**, with the values in
   *The entry* below; set **Owner** to yourself, agree to the Developer
   policies, confirm you'll keep supporting the plugin, and **Submit**.
   If the form answers *"an entry already exists for this repository"*, the
   archived entry still holds the repository (GitHub keeps the repository's
   id through a rename, so the directory may see it as the same one). Ask on
   the forum for the old entry's deletion, as
   [this thread](https://forum.obsidian.md/t/cannot-resubmit-plugin-after-archiving-an-entry-already-exists-for-this-repository/114435)
   did, then submit again.
4. **The automated review** runs on submission: **Manifest**, **Releases**,
   **Source code** and **Build verification** (it runs `npm run build` and
   compares the result with the 0.4.0 release's `main.js`). Errors block
   installation; warnings don't. **Review branch** → leave the branch blank
   → **Run preview scan** runs it again on demand.
5. **Edit listing** on the new entry: payment type **Optional payment** (the
   FAQ's answer for a plugin that relies on a third-party service that may
   charge, even with a free tier; Spoken needs a Gemini key), and the
   categories.
6. **On the Pixel**: Settings → Community plugins → **Loam Dictate** →
   **Uninstall**; that deletes its folder, the key in its `data.json` with it.
   Then Settings → BRAT → remove `michaelhejazi/loam-dictate` from the beta
   plugin list, and **Add beta plugin** → `michaelhejazi/spoken`. Enable
   Spoken, paste the Gemini key, press Check key, and re-add *Spoken: Dictate*
   to the toolbar (Settings → Toolbar). The terms note stays in the vault and
   is found again at `Dictation terms.md`. Once the directory lists Spoken,
   remove it from BRAT's list, so only Obsidian's updater installs releases.
7. **The repository's About box** (the gear beside *About* on the code page),
   any time:

   | Field | Text |
   |---|---|
   | Description | `Speak into a note on phone or desktop and get clean text at the cursor: transcribed by Gemini under your own API key, with your own names spelled right.` |
   | Website | leave empty until the directory lists it, then `https://obsidian.md/plugins?id=spoken` |
   | Topics | `obsidian`, `obsidian-plugin`, `dictation`, `speech-to-text`, `transcription`, `gemini`, `voice-notes` |

GitHub redirects the old repository address to the new one, for the web
pages, the API and git, so links to `michaelhejazi/loam-dictate` (old issues,
old release notes, a clone's remote) keep working. The redirect holds only
while no new repository takes the old name. The README's images are linked by
absolute `raw.githubusercontent.com` URL, because the listing renders the
README away from the repository; they already point at `michaelhejazi/spoken`,
and so do the README's other links and the plugin's Report a problem link.

## The entry

| Field | Value |
|---|---|
| GitHub repository URL (the form) | `https://github.com/michaelhejazi/spoken` |
| Owner (the form) | Myself |
| id (manifest) | `spoken` |
| name (manifest) | `Spoken` |
| author (manifest) | `Michael Hejazi` |
| authorUrl (manifest) | `https://github.com/michaelhejazi` |
| description (manifest) | `Speak into a note on phone or desktop and get clean text at the cursor: transcribed by Gemini under your own API key, with your own names spelled right.` |

`authorUrl` (in `manifest.json`) and `homepage` (in `package.json`) point to
the author's GitHub profile for now. When his own site is ready, both change to
it in a commit on `main`, with no release: the directory reads `manifest.json`
from the head of `main`, and neither field is in the plugin's code.

Turn on **Action required notifications** in your community profile, so a
failed check later reaches you by email.

## What the review will see

`npm run lint` runs the same rules locally
([eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin)'s
recommended set). From 0.3.2 it reports no errors and no warnings.

0.3.2 moved the settings tab to Obsidian 1.13's declarative API
(`getSettingDefinitions()`), which cleared `prefer-setting-definitions` and
the deprecated `display` and `setDynamicTooltip`, and raised `minAppVersion`
to 1.13.0; `versions.json` offers older Obsidian 0.3.1. The two sentence-case
warnings 0.3.1 had are gone too, but only because the rule reads `setDesc()`
and `createEl()` text and not a definition's `desc`: the strings still name
Obsidian's menus (*Settings → Toolbar*) with their capitals, on purpose. The
directory's scanner may also flag the notices that begin "Spoken:", since it
doesn't know the plugin's name is a proper noun; the repo's lint config lists
it as a brand.

The directory's scorecard also checks for GitHub artifact attestations on the
release assets; `release.yml` attests all three from 0.3.2. The clipboard
disclosure it lists is correct: Copy on the sheet writes the words to the
clipboard.

## The guideline check, rule by rule

| Rule | Result |
|---|---|
| LICENSE file, license clearly indicated | Pass: MIT, `LICENSE`, `package.json` `license: MIT` |
| README describes purpose and use | Pass |
| Network use disclosed in the README, which services and why | Pass: README → Where your recordings and key go → Network use |
| No client-side telemetry | Pass: none; the only requests are the take and Check key, both to Google, both on the user's action |
| No ads, no obfuscation, no self-update | Pass |
| Account or payment disclosed | Pass: a Google account and Gemini key are needed; the README links Google's pricing page |
| `fundingUrl` only for donations | Pass: none |
| `minAppVersion` appropriate | Pass: 1.13.0, which the declarative settings API needs; the lint rule `no-unsupported-api` finds no newer API in use |
| Description: action first, ≤ 250 characters, ends with a period, no emoji | Pass: 152 characters |
| Node and Electron APIs only on desktop | Pass: none used; `isDesktopOnly: false` |
| No plugin id in command ids | Pass: the command is `dictate` |
| Sample code and placeholder names removed | Pass |
| Use `this.app`, not the global `app` | Pass |
| Only private API: none | Pass: `app.setting.close` removed in 0.3.0 |
| No unnecessary console logging | Pass: no `console` calls at all |
| Folders for several `.ts` files (should) | Not followed: sixteen small files in one `src/`, each named for what it does; a folder per two files would hide more than it shows |
| No settings-tab heading at the top, none with "settings", sentence case | Pass, except the warnings above |
| `setHeading` instead of HTML headings | Pass: no headings |
| No `innerHTML`, `outerHTML`, `insertAdjacentHTML` | Pass |
| Resources released on unload | Pass: commands, ribbon, setting tab and the leaf event are registered; sheets close on unload and release the microphone, wake lock, timer, animation frame and listeners |
| Don't detach leaves in `onunload` | Pass |
| No default hotkeys | Pass |
| Right command callback | Pass: `editorCallback` |
| No `workspace.activeLeaf` | Pass |
| No stored references to custom views | Pass: no custom views |
| Editor API for the active note | Pass: Insert goes through the `Editor` |
| `Vault.process` for background edits | Pass: Add to note uses it |
| Vault API over the adapter (should) | Not followed for reading the terms note: `vault.adapter` reads the file on disk, so an edit synced from another device a moment ago counts on the next take, which the vault's cache can miss |
| No iterating all files to find one | Pass |
| `normalizePath` on user paths | Pass |
| No inline styles | Pass: classes in `styles.css`, Obsidian's variables |
| No regex lookbehind (iOS) | Pass |
| `const`/`let`, async/await | Pass |
