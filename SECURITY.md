# Security

## Reporting a problem

Please report a security problem privately, not in a public issue. On this
repository's **Security** tab, select **Report a vulnerability**: that is
GitHub's private vulnerability reporting, and only the maintainer sees what
you write.

If that button isn't there, open an issue titled "Security" with no details
in it, and the maintainer will reply with a private way to send them.

Fixes go out in a new release; the reporter is credited in the changelog
unless they ask not to be.

## Where your key lives

Your Gemini API key is stored in the plugin's settings file inside your vault,
`.obsidian/plugins/spoken/data.json`, in plain text, as every Obsidian
plugin's settings are. It leaves your device only in the `x-goog-api-key`
header of requests to Google's Gemini API, made when you stop a recording,
press Try again or press Check key. The plugin has no server of its own and no
telemetry, and **Report a problem** never puts the key in the issue it opens.
Anything that syncs or backs up your vault's `.obsidian` folder carries the key
with it; if you think it has leaked, delete it in
[Google AI Studio](https://aistudio.google.com/apikey) and create a new one.

## Supported versions

Only the latest release gets fixes.
