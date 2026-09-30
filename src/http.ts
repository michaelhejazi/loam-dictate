// The part of Obsidian's requestUrl the transcribers use. Going through
// requestUrl means no browser CORS applies, on phone or desktop; tests pass a
// fetch-backed stand-in (test/fetch-client.ts).

import { TranscribeError } from "./transcriber";

export interface HttpRequest {
	url: string;
	method: string;
	contentType: string;
	body: ArrayBuffer | string;
	headers: Record<string, string>;
	throw: false;
}
export interface HttpResponse {
	status: number;
	text: string;
}
export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;

/** The model may take 120 s; wait a little past that. */
export const WAIT_MS = 150_000;

/**
 * Sends the request, giving up after waitMs with tooSlow. A request that never
 * reached an answer (no network, no DNS, refused) becomes unreachable. Either
 * way the status is 0 and the take is kept.
 */
export async function send(
	http: HttpClient,
	request: HttpRequest,
	waitMs: number,
	sentences: { unreachable: string; tooSlow: string },
): Promise<HttpResponse> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new TranscribeError(sentences.tooSlow, 0)), waitMs);
	});
	try {
		return await Promise.race([http(request), timeout]);
	} catch (e) {
		if (e instanceof TranscribeError) throw e;
		throw new TranscribeError(sentences.unreachable, 0);
	} finally {
		clearTimeout(timer);
	}
}

export function parseJson(text: string): Record<string, unknown> | null {
	try {
		const v: unknown = JSON.parse(text);
		return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}
