# The dictation route

The plugin calls one route on a Loam UI server. This is its contract as the
plugin relies on it; `test/fake-loam.mjs` implements it and the tests run
against that fake. The real route is built and owned by Loam UI.

*Written 2026-09-28 for the first version of the plugin.*

## Request

```
POST <server>/api/dictate
Authorization: Bearer <token>
Content-Type: <the recording's real MIME type, e.g. audio/webm;codecs=opus>
x-vocabulary: <encodeURIComponent(JSON.stringify(["term", ...]))>

<the raw audio bytes>
```

- `<server>` is the address in the plugin's settings; trailing slashes are dropped.
- The vocabulary is the names and terms in the user's terms note, then the open note's title and
  headings: each once regardless of case, none over 80 characters, at most 100
  terms and at most 6,000 bytes once encoded, cut from the end
  (`src/vocabulary.ts`).
- The plugin waits up to 150 s for an answer.

## Answers

`200`:

```json
{ "text": "the cleaned words", "biased": true, "model": "gemini-3.5-transcribe" }
```

`biased` says whether the vocabulary was used. `model` is not used by the plugin.

Every failure is `{ "error": "<a sentence for the user>" }`:

| Status | Meaning |
|---|---|
| 400 | empty take |
| 401 | bad token |
| 413 | over 12 MB |
| 415 | an audio type the model does not read |
| 422 | no words heard |
| 429 | rate-limited |
| 502 | the model failed |
| 503 | dictation not set up on the server |
| 504 | the model took over 120 s |

The plugin shows the server's sentence as it is. If an error arrives without
one (a proxy's HTML page, say), it shows its own sentence for that status
(`FALLBACK` in `src/loam.ts`), never a bare code. If the server cannot be
reached or does not answer within 150 s, it says so and keeps the take for
Try again.
