# The Gemini request

With the Gemini provider the plugin calls Google's Interactions API directly,
under the user's own key. This is what it sends and how it reads the answer;
`src/gemini.ts` implements it and `test/fake-gemini.mjs` is the fake the tests
run against. It is the same request the Loam UI server sends for dictation.

*Written 2026-09-30 from Google's docs as they read that day:
[transcribe](https://ai.google.dev/gemini-api/docs/transcribe),
[gemini-3.5-transcribe](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe),
[Interactions API](https://ai.google.dev/api/interactions-api).*

## Request

```
POST https://generativelanguage.googleapis.com/v1beta/interactions
x-goog-api-key: <the user's key>
Content-Type: application/json

{
  "model": "gemini-3.5-transcribe",
  "input": [{ "type": "audio", "mime_type": "audio/webm", "data": "<the take, base64>" }],
  "generation_config": {
    "transcription_config": { "mode": "smart", "custom_vocabulary": ["Simin", "Flyo"] }
  }
}
```

- `model` is the Model setting, `gemini-3.5-transcribe` when blank.
- `custom_vocabulary` is the list built in `src/vocabulary.ts` (the terms note,
  then the open note's title and headings, at most 100). It is left out when
  the list is empty. Google's model page allows up to 1,000 terms and advises
  up to 100 for best results; the Interactions reference states no limit.
- `mime_type` is the recording's type with its parameters dropped
  (`audio/webm;codecs=opus` → `audio/webm`). iOS records `audio/mp4`, which is
  not on Gemini's list; it is sent as `audio/m4a`. That mapping has not been
  proved on an iPhone.
- `mode: "smart"` is the string form the transcribe guide shows. The
  Interactions reference describes the mode as an object with `"type": "smart"`
  or an enum; the string is what the Loam server sends and is kept.
- The plugin waits up to 150 s. The request goes through Obsidian's
  `requestUrl`, so no browser CORS applies.

## Answer

The text is every `content[]` item of `type: "text"` in every `steps[]` item
of `type: "model_output"`, joined in order and trimmed. A `status` other than
`completed` is an error, and so is completed with no text.

## Failures, as sentences

| What happened | Sentence (constants in `src/gemini.ts`) |
|---|---|
| no key in settings (nothing is sent) | `NO_KEY` |
| 401, 403, or any error whose message mentions the API key (Google answers a wrong key with 400 `API key not valid`) | `BAD_KEY` |
| 429 or `RESOURCE_EXHAUSTED` | `RATE_LIMITED` |
| 413, or a message saying the payload is too large | `TOO_LARGE` |
| 404 | `unknownModel(model)` |
| 503 | `OVERLOADED` |
| 504, or no answer within 150 s | `TOO_SLOW` |
| other 5xx | `MODEL_FAILED` |
| `status` not `completed` | `NOT_FINISHED` |
| completed with no text | `NO_WORDS` |
| Google not reached | `UNREACHABLE` |
| any other error | Google's own message after "Gemini couldn't transcribe the recording:" |

**The vocabulary fallback.** If Gemini answers 400 with a message mentioning
vocabulary, the plugin sends the same take once more without
`custom_vocabulary` and reports `biased: false`. It does not retry again.
