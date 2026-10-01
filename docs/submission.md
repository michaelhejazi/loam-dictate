# Submitting to Obsidian's community directory

This page is for the repository's owner, who submits by hand. Everything
here was read from Obsidian's developer docs on 2026-10-01
([Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin),
[Set up and claim](https://docs.obsidian.md/community-directory/set-up-and-claim),
[Manage your plugin or theme](https://docs.obsidian.md/community-directory/manage-entry),
[FAQ](https://docs.obsidian.md/community-directory/faq),
[Developer policies](https://docs.obsidian.md/community-directory/developer-policies),
[Submission requirements for plugins](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins),
[Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)).

Submission is no longer a pull request to `obsidianmd/obsidian-releases`: it
is a form on community.obsidian.md, and the directory reads the rest from the
repository.

## The entry

The form asks for two things; the directory reads the rest from
`manifest.json` at the head of the default branch (`main`).

| Field | Value |
|---|---|
| GitHub repository URL (the form) | `https://github.com/michaelhejazi/loam-dictate` |
| Owner (the form) | Myself |
| id (manifest) | `loam-dictate` |
| name (manifest) | `Loam Dictate` |
| author (manifest) | `Michael Hejazi` |
| authorUrl (manifest) | `https://github.com/michaelhejazi` |
| description (manifest) | `Dictate into your notes on phone or desktop: record a spoken take, have Gemini transcribe it with your own API key, and insert the words at the cursor.` |

After it is listed, **Edit listing** sets the categories and the payment type.
The FAQ says a plugin that relies on a third-party service that may charge is
**Optional payment**, even when that service has a free tier, so that is the
honest choice for a plugin that needs a Gemini key.

## Before you submit

1. **The repository must be readable by the directory.** Either make
   `michaelhejazi/loam-dictate` public, or keep it private and publish the
   releases from a separate public repository, then install the
   [Obsidian Community directory GitHub App](https://github.com/apps/obsidian-community-directory)
   on the private one so the directory can verify the build against the
   source. Making it public is the simpler of the two, and BRAT users then
   need no token.
2. The release named by `manifest.json`'s `version` exists, with `main.js`,
   `manifest.json` and `styles.css` attached (the release workflow does this on
   a tag).
3. `LICENSE` (MIT) and `README.md` are at the root. They are.

## Steps

1. Go to [community.obsidian.md](https://community.obsidian.md) and select
   **Sign in** (upper right). Sign in with your Obsidian account.
2. On your **Community profile**, under **GitHub**, select **Connect** and
   authorise on GitHub. This lets the directory verify that you own the
   repository.
3. In the sidebar, go to **Plugins** → **New plugin**. Enter the GitHub
   repository URL above, set **Owner** to yourself, agree to the Developer
   policies, confirm that you'll keep supporting the plugin (or remove or
   transfer it if you can't), and select **Submit**.
4. The directory reviews it automatically: **Manifest**, **Releases**,
   **Source code** and **Build verification** (it runs `npm run build` and
   compares the result with the release's `main.js`). Errors block
   installation; warnings don't. To fix an error, change the repository and
   publish a new release with a higher version; **...** → **Request review**
   rechecks at once.
5. On the entry's page, **Review branch** → leave the branch blank for `main`
   → **Run preview scan** runs the same review on demand, without a release.
6. Turn on **Action required notifications** in your profile, so a failed
   check later reaches you by email.

## What the review will see

`npm run lint` runs the same rules locally
([eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin)'s
recommended set). On 0.3.0 it reports no errors and these warnings, which
don't block a submission and are kept on purpose:

- **`prefer-setting-definitions`, and `display` deprecated (three places).**
  The declarative settings API needs Obsidian 1.13. The plugin supports
  1.4.0 and up (`minAppVersion`), and below 1.13 the directory's own rule
  requires `display()`. Adopting it means raising `minAppVersion` to 1.13;
  that is a choice for later, not a fix.
- **`setDynamicTooltip` deprecated.** From 1.13 the slider shows its value on
  its own; on older Obsidian this call is what shows it.
- **Sentence case (two strings).** Both name Obsidian's own menus,
  *Settings → Toolbar* and a self-hosted server's menu path, which keep their
  capitals. The directory's scanner may also flag the notices that begin
  "Loam Dictate:", since it doesn't know the plugin's name is a proper noun;
  the repo's lint config lists it as a brand.

## The guideline check, rule by rule

| Rule | Result |
|---|---|
| LICENSE file, license clearly indicated | Pass: MIT, `LICENSE`, `package.json` `license: MIT` |
| README describes purpose and use | Pass |
| Network use disclosed in the README, which services and why | Pass: README → Network use |
| No client-side telemetry | Pass: none; the only requests are the take and Check key, both to Google, both on the user's action |
| No ads, no obfuscation, no self-update | Pass |
| Account or payment disclosed | Pass: a Google account and Gemini key are needed; the README links Google's pricing page |
| `fundingUrl` only for donations | Pass: none |
| `minAppVersion` appropriate | Pass: 1.4.0; the lint rule `no-unsupported-api` finds no newer API in use |
| Description: action first, ≤ 250 characters, ends with a period, no emoji | Pass: 151 characters |
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
