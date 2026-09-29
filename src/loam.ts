// The Loam UI implementation of Transcriber: POST <server>/api/dictate.
// The route's contract is written down in docs/dictate-route.md.

import { Transcriber, TranscribeError, Transcript } from "./transcriber";

/** The part of Obsidian's requestUrl this uses; tests pass a fetch-backed stand-in. */
export interface HttpRequest {
	url: string;
	method: string;
	contentType: string;
	body: ArrayBuffer;
	headers: Record<string, string>;
	throw: false;
}
export interface HttpResponse {
	status: number;
	text: string;
}
export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;

export interface LoamConfig {
	server: string;
	token: string;
}

/** The server may take 120 s on the model; wait a little past that. */
export const WAIT_MS = 150_000;

/** Shown when the server answered with an error but no sentence of its own. */
export const FALLBACK: Record<number, string> = {
	400: "The recording was empty.",
	401: "Loam didn't accept the token. Check it in Loam Dictate's settings.",
	413: "The recording is too long to send (over 12 MB).",
	415: "Loam can't read this kind of audio.",
	422: "No words were heard in the recording.",
	429: "Loam is busy. Wait a moment and try again.",
	502: "The model failed to clean the recording.",
	503: "Dictation isn't set up on the Loam server.",
	504: "The model took too long to answer.",
};
export const UNREACHABLE = "Loam couldn't be reached. The recording is still here.";
export const TOO_SLOW = "Loam took too long to answer. The recording is still here.";
export const NOT_CONFIGURED = "Set the server address and token in Loam Dictate's settings.";
export const UNREADABLE = "Loam answered with something that isn't a transcript.";

export function dictateUrl(server: string): string {
	return server.trim().replace(/\/+$/, "") + "/api/dictate";
}

export class LoamTranscriber implements Transcriber {
	constructor(
		private readonly config: () => LoamConfig,
		private readonly http: HttpClient,
		private readonly waitMs = WAIT_MS,
	) {}

	async transcribe(audio: ArrayBuffer, mimeType: string, terms: string[]): Promise<Transcript> {
		const { server, token } = this.config();
		if (!server.trim() || !token.trim()) throw new TranscribeError(NOT_CONFIGURED, 0);

		const request: HttpRequest = {
			url: dictateUrl(server),
			method: "POST",
			contentType: mimeType,
			body: audio,
			headers: {
				Authorization: `Bearer ${token.trim()}`,
				"x-vocabulary": encodeURIComponent(JSON.stringify(terms)),
			},
			throw: false,
		};

		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new TranscribeError(TOO_SLOW, 0)), this.waitMs);
		});
		let res: HttpResponse;
		try {
			res = await Promise.race([this.http(request), timeout]);
		} catch (e) {
			if (e instanceof TranscribeError) throw e;
			throw new TranscribeError(UNREACHABLE, 0);
		} finally {
			clearTimeout(timer);
		}

		const body = parse(res.text);
		if (res.status === 200) {
			if (body && typeof body.text === "string") {
				return { text: body.text, biased: body.biased === true };
			}
			throw new TranscribeError(UNREADABLE, 200);
		}
		const sentence = body && typeof body.error === "string" && body.error.trim() ? body.error.trim() : null;
		throw new TranscribeError(sentence ?? FALLBACK[res.status] ?? `Loam answered with an error (${res.status}).`, res.status);
	}
}

function parse(text: string): Record<string, unknown> | null {
	try {
		const v: unknown = JSON.parse(text);
		return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}
