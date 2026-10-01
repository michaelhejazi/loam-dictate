// The Gemini implementation of Transcriber: the take goes straight from the
// device to Google's Interactions API under the user's own key.
// POST https://generativelanguage.googleapis.com/v1beta/interactions, as the
// Loam server sends it; docs/gemini-request.md says what is sent and why.

import { HttpClient, HttpRequest, WAIT_MS, parseJson, send } from "./http";
import { Transcriber, TranscribeError, Transcript } from "./transcriber";

export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const DEFAULT_MODEL = "gemini-3.5-transcribe";

export interface GeminiConfig {
	key: string;
	model: string;
}

export const NO_KEY = "Paste your Gemini API key in Loam Dictate's settings.";
export const BAD_KEY = "Google didn't accept the API key. Check it in Loam Dictate's settings.";
export const RATE_LIMITED = "Gemini is limiting requests on this key. Wait a moment and try again.";
export const NOT_FINISHED = "Gemini didn't finish transcribing the recording. Try again.";
export const MODEL_FAILED = "Gemini failed to transcribe the recording. Try again.";
export const OVERLOADED = "Gemini is overloaded right now. Try again in a moment.";
export const UNREACHABLE = "Google couldn't be reached. The recording is still here.";
export const TOO_SLOW = "Gemini took too long to answer. The recording is still here.";
export const NO_WORDS = "No words were heard in the recording.";
export const TOO_LARGE = "The recording is too large to send to Gemini in one request.";
export const UNREADABLE = "Gemini answered with something that isn't a transcript.";
export const unknownModel = (model: string) =>
	`Gemini has no model called "${model}". Check the model name in Loam Dictate's settings.`;

/**
 * The MIME type Gemini is told. Parameters are dropped (Chrome's
 * audio/webm;codecs=opus is sent as audio/webm), and iOS's audio/mp4 is sent
 * as audio/m4a, the name Gemini's list has for AAC in MP4. The mp4 mapping has
 * not yet been proved on an iPhone.
 */
export function geminiMime(mimeType: string): string {
	const base = mimeType.split(";")[0].trim().toLowerCase();
	if (base === "audio/mp4" || base === "audio/x-m4a") return "audio/m4a";
	return base;
}

export function toBase64(audio: ArrayBuffer): string {
	const bytes = new Uint8Array(audio);
	let binary = "";
	// In slices, so a long take doesn't overflow the argument list.
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

/** The body Gemini is sent; the vocabulary key is left out when there are no terms. */
export function geminiBody(model: string, audio: ArrayBuffer, mimeType: string, terms: string[]): object {
	return {
		model,
		input: [{ type: "audio", mime_type: geminiMime(mimeType), data: toBase64(audio) }],
		generation_config: {
			transcription_config: { mode: "smart", ...(terms.length ? { custom_vocabulary: terms } : {}) },
		},
	};
}

export class GeminiTranscriber implements Transcriber {
	constructor(
		private readonly config: () => GeminiConfig,
		private readonly http: HttpClient,
		private readonly waitMs = WAIT_MS,
		/** Tests point this at test/fake-gemini.mjs; the plugin never changes it. */
		private readonly endpoint = GEMINI_ENDPOINT,
	) {}

	async transcribe(audio: ArrayBuffer, mimeType: string, terms: string[]): Promise<Transcript> {
		const key = this.config().key.trim();
		const model = this.config().model.trim() || DEFAULT_MODEL;
		if (!key) throw new TranscribeError(NO_KEY, 0);

		const first = await this.post(key, model, audio, mimeType, terms);
		if (terms.length && first.status === 400 && /vocabulary/i.test(errorOf(first.text).message)) {
			// Gemini refused the terms: send once more in smart mode without them.
			return this.read(await this.post(key, model, audio, mimeType, []), model, false);
		}
		return this.read(first, model, terms.length > 0);
	}

	private post(key: string, model: string, audio: ArrayBuffer, mimeType: string, terms: string[]) {
		const request: HttpRequest = {
			url: this.endpoint,
			method: "POST",
			contentType: "application/json",
			body: JSON.stringify(geminiBody(model, audio, mimeType, terms)),
			headers: { "x-goog-api-key": key },
			throw: false,
		};
		return send(this.http, request, this.waitMs, { unreachable: UNREACHABLE, tooSlow: TOO_SLOW });
	}

	private read(res: { status: number; text: string }, model: string, biased: boolean): Transcript {
		if (res.status !== 200) throw new TranscribeError(failure(res.status, errorOf(res.text), model), res.status);
		const body = parseJson(res.text);
		if (!body) throw new TranscribeError(UNREADABLE, 200);
		if (body.status !== "completed") throw new TranscribeError(NOT_FINISHED, 200);
		const text = outputText(body).trim();
		if (!text) throw new TranscribeError(NO_WORDS, 200);
		return { text, biased };
	}
}

/** The text of every model_output step, in order. */
function outputText(body: Record<string, unknown>): string {
	type Part = { type?: unknown; text?: unknown; content?: unknown } | null;
	const steps: Part[] = Array.isArray(body.steps) ? (body.steps as Part[]) : [];
	let text = "";
	for (const step of steps) {
		if (!step || step.type !== "model_output" || !Array.isArray(step.content)) continue;
		for (const part of step.content as Part[]) {
			if (part && part.type === "text" && typeof part.text === "string") text += part.text;
		}
	}
	return text;
}

interface GoogleError {
	message: string;
	/** Google's status name, e.g. INVALID_ARGUMENT, RESOURCE_EXHAUSTED. */
	status: string;
}

function errorOf(text: string): GoogleError {
	const err = parseJson(text)?.error as Record<string, unknown> | undefined;
	return {
		message: typeof err?.message === "string" ? err.message : "",
		status: typeof err?.status === "string" ? err.status : "",
	};
}

/** A sentence for the user for each way Gemini says no. Never a bare code. */
function failure(status: number, err: GoogleError, model: string): string {
	// Google answers a wrong key with 400 INVALID_ARGUMENT "API key not valid", not 401.
	if (status === 401 || status === 403 || /api key/i.test(err.message)) return BAD_KEY;
	if (status === 429 || err.status === "RESOURCE_EXHAUSTED") return RATE_LIMITED;
	if (status === 413 || /too large|exceeds|payload size/i.test(err.message)) return TOO_LARGE;
	if (status === 404) return unknownModel(model);
	if (status === 503) return OVERLOADED;
	if (status === 504) return TOO_SLOW;
	if (status >= 500) return MODEL_FAILED;
	return err.message
		? `Gemini couldn't transcribe the recording: ${err.message}`
		: `Gemini answered with an error (${status}).`;
}
