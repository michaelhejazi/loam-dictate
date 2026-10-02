// A fake of Gemini's Interactions API, POST /v1beta/interactions, as far as
// the plugin uses it (docs/gemini-request.md): it checks the key the way
// Google does (400 INVALID_ARGUMENT "API key not valid"), checks the body's
// shape, and answers with a completed interaction whose model_output text
// describes the audio it was sent. A text interaction (Polish, src/polish.ts)
// is answered with the transcript it was given, unchanged, for a model it knows,
// and 404 NOT_FOUND for any other. It also serves GET /v1beta/models/{model},
// the model record Check key reads: the record for a model it knows, 404
// NOT_FOUND for any other. The tests start it in-process.
//
// The key is a fixture and obviously fake: FAKE_GEMINI_KEY below.

import { createServer } from "node:http";

export const FAKE_GEMINI_KEY = "fake-gemini-key-not-a-secret";
export const PATH = "/v1beta/interactions";
export const MODELS_PATH = "/v1beta/models";
export const KNOWN_MODELS = ["gemini-3.5-transcribe", "gemini-3.5-flash-lite"];
export const MIME_TYPES = [
	"audio/wav", "audio/mp3", "audio/aiff", "audio/aac", "audio/ogg", "audio/flac", "audio/mpeg",
	"audio/m4a", "audio/l16", "audio/opus", "audio/alaw", "audio/mulaw", "audio/webm",
];

const googleError = (code, status, message) => ({ error: { code, message, status } });

/** Why a Polish body isn't one the plugin should send, or null when it is. */
function invalidText(body) {
	if (typeof body.model !== "string" || !body.model) return "model is required.";
	if (typeof body.system_instruction !== "string" || !body.system_instruction) return "system_instruction must be a string.";
	if (!/<transcript>\n[\s\S]*\n<\/transcript>$/.test(body.input)) return "input must end with the fenced transcript.";
	if (body.store !== false) return "store must be false.";
	return null;
}

/** Why the body isn't one the plugin should send, or null when it is. */
function invalid(body) {
	if (!body || typeof body !== "object") return "Invalid JSON payload.";
	if (typeof body.model !== "string" || !body.model) return "model is required.";
	const audio = body.input?.[0];
	if (!Array.isArray(body.input) || body.input.length !== 1 || audio?.type !== "audio") return "input must be one audio item.";
	if (!MIME_TYPES.includes(audio.mime_type)) return `Unsupported MIME type: ${audio.mime_type}`;
	if (typeof audio.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(audio.data)) return "data must be base64.";
	const tc = body.generation_config?.transcription_config;
	if (!tc || tc.mode !== "smart") return "transcription_config.mode must be smart.";
	if ("custom_vocabulary" in tc) {
		const v = tc.custom_vocabulary;
		if (!Array.isArray(v) || !v.length || v.some((t) => typeof t !== "string")) return "custom_vocabulary must be a non-empty list of strings.";
		if (v.length > 1000) return "custom_vocabulary has more than 1000 terms.";
	}
	return null;
}

/** A completed interaction whose model output is this text, as Google shapes it. */
export function completed(model, userSteps, text) {
	return {
		id: "v1_fake",
		object: "interaction",
		model,
		status: "completed",
		steps: [...userSteps, { type: "model_output", content: [{ type: "text", text }] }],
	};
}

/**
 * @param {{ key?: string, port?: number, host?: string }} [opts]
 */
export async function startFakeGemini(opts = {}) {
	const key = opts.key ?? FAKE_GEMINI_KEY;
	const requests = [];
	const scripted = [];
	const state = { rejectVocabulary: false };

	const server = createServer((req, res) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => {
			const raw = Buffer.concat(chunks).toString("utf8");
			let json = null;
			try {
				json = JSON.parse(raw);
			} catch {
				json = null;
			}
			requests.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, json });

			const send = (status, payload, delayMs = 0) =>
				setTimeout(() => {
					if (res.destroyed) return;
					res.writeHead(status, { "Content-Type": "application/json" });
					res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
				}, delayMs);

			const modelGet = req.method === "GET" && (req.url ?? "").startsWith(MODELS_PATH + "/");
			if (!modelGet && (req.method !== "POST" || req.url !== PATH)) return send(404, googleError(404, "NOT_FOUND", "Not found."));
			if (req.headers["x-goog-api-key"] !== key) {
				return send(400, googleError(400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key."));
			}
			if (modelGet) {
				const name = decodeURIComponent((req.url ?? "").slice(MODELS_PATH.length + 1));
				const next = scripted.shift();
				if (next) return send(next.status, next.body, next.delayMs);
				if (!KNOWN_MODELS.includes(name)) {
					return send(404, googleError(404, "NOT_FOUND", `models/${name} is not found for API version v1beta.`));
				}
				return send(200, { name: `models/${name}`, baseModelId: name, version: "001", displayName: "Fake model" });
			}
			const next = scripted.shift();
			if (next) return send(next.status, next.body, next.delayMs);
			if (json && typeof json.input === "string") {
				const why = invalidText(json);
				if (why) return send(400, googleError(400, "INVALID_ARGUMENT", why));
				if (!KNOWN_MODELS.includes(json.model)) {
					return send(404, googleError(404, "NOT_FOUND", `models/${json.model} is not found for API version v1beta.`));
				}
				const transcript = /<transcript>\n([\s\S]*)\n<\/transcript>$/.exec(json.input)[1];
				return send(200, completed(json.model, [{ type: "user_input", content: [{ type: "text", text: json.input }] }], transcript));
			}
			const why = invalid(json);
			if (why) return send(400, googleError(400, "INVALID_ARGUMENT", why));
			if (state.rejectVocabulary && json.generation_config.transcription_config.custom_vocabulary) {
				return send(400, googleError(400, "INVALID_ARGUMENT", "custom_vocabulary is not supported for this request."));
			}
			const audio = json.input[0];
			const bytes = Buffer.from(audio.data, "base64").length;
			send(
				200,
				completed(json.model, [{ type: "user_input", content: [{ type: "audio", mime_type: audio.mime_type }] }], `Fake transcript of ${bytes} bytes of ${audio.mime_type}.`),
			);
		});
	});

	await new Promise((resolve) => server.listen(opts.port ?? 0, opts.host ?? "127.0.0.1", () => resolve(undefined)));
	const address = server.address();
	return {
		url: `http://${address.address}:${address.port}${PATH}`,
		key,
		requests,
		/** When true, any request with custom_vocabulary is refused with a 400 naming it. */
		set rejectVocabulary(v) {
			state.rejectVocabulary = v;
		},
		/** The next request gets this answer instead, after the key check. */
		respondNext(status, body, delayMs = 0) {
			scripted.push({ status, body, delayMs });
		},
		close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve(undefined)); }),
	};
}
