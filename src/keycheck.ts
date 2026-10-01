// The settings tab's Check key: one small request that proves both the key and
// the model name. GET .../v1beta/models/{model} reads the model's own record;
// it costs no tokens, and Google answers it only for a key it accepts and a
// model it has. docs/gemini-request.md describes it beside the take's request.

import { DEFAULT_MODEL } from "./gemini";
import { HttpClient, HttpRequest, parseJson, send } from "./http";

export const MODELS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** A check is quick or it says so; a take waits far longer. */
export const CHECK_WAIT_MS = 15_000;

export type KeyCheckOutcome = "works" | "no key" | "refused" | "unknown model" | "unreachable" | "other";

export interface KeyCheck {
	outcome: KeyCheckOutcome;
	sentence: string;
}

export const CHECK_NO_KEY = "Paste a key first.";
export const CHECK_REFUSED = "Google refused this key. Copy it again from Google AI Studio.";
export const CHECK_UNREACHABLE = "Google couldn't be reached. Check the connection and try again.";
export const checkWorks = (model: string) => `The key works, and the model ${model} exists.`;
export const checkUnknownModel = (model: string) =>
	`The key works, but Google has no model called "${model}". Check the model name.`;

/** The request Check key sends. The key goes in a header, never in the URL. */
export function keyCheckRequest(key: string, model: string, base = MODELS_ENDPOINT): HttpRequest {
	const name = model.trim().replace(/^models\//, "") || DEFAULT_MODEL;
	return {
		url: `${base}/${encodeURIComponent(name)}`,
		method: "GET",
		headers: { "x-goog-api-key": key.trim() },
		throw: false,
	};
}

export async function checkGeminiKey(
	key: string,
	model: string,
	http: HttpClient,
	waitMs = CHECK_WAIT_MS,
	/** Tests point this at test/fake-gemini.mjs; the plugin never changes it. */
	base = MODELS_ENDPOINT,
): Promise<KeyCheck> {
	const name = model.trim() || DEFAULT_MODEL;
	if (!key.trim()) return { outcome: "no key", sentence: CHECK_NO_KEY };
	let res;
	try {
		res = await send(http, keyCheckRequest(key, name, base), waitMs, { unreachable: "", tooSlow: "" });
	} catch {
		return { outcome: "unreachable", sentence: CHECK_UNREACHABLE };
	}
	const err = parseJson(res.text)?.error as { message?: unknown; status?: unknown } | undefined;
	const message = typeof err?.message === "string" ? err.message : "";
	if (res.status === 200) return { outcome: "works", sentence: checkWorks(name) };
	// Google answers a wrong key with 400 INVALID_ARGUMENT "API key not valid", not 401.
	if (res.status === 401 || res.status === 403 || /api key/i.test(message)) return { outcome: "refused", sentence: CHECK_REFUSED };
	if (res.status === 404) return { outcome: "unknown model", sentence: checkUnknownModel(name) };
	return {
		outcome: "other",
		sentence: message ? `Google answered: ${message}` : `Google answered with an error (${res.status}).`,
	};
}
