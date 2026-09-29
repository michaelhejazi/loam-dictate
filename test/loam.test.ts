import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FALLBACK, LoamTranscriber, NOT_CONFIGURED, TOO_SLOW, UNREACHABLE, dictateUrl } from "../src/loam";
import { TranscribeError } from "../src/transcriber";
import { Fake, startFake } from "./fake-loam.mjs";
import { fetchClient } from "./fetch-client";

let fake: Fake;
beforeAll(async () => {
	fake = await startFake();
});
afterAll(() => fake.close());

const audio = new Uint8Array([1, 2, 3, 4, 5]).buffer;
const loam = (server = fake.url, token = fake.token, waitMs?: number) =>
	new LoamTranscriber(() => ({ server, token }), fetchClient, waitMs);

async function failure(p: Promise<unknown>): Promise<TranscribeError> {
	try {
		await p;
	} catch (e) {
		expect(e).toBeInstanceOf(TranscribeError);
		return e as TranscribeError;
	}
	throw new Error("expected a failure");
}

describe("the request to POST /api/dictate", () => {
	it("sends the raw audio with the real MIME type, the bearer token and the encoded vocabulary", async () => {
		const terms = ["Simin", "Flyo", "café & co", "ridge loop"];
		const res = await loam().transcribe(audio, "audio/webm;codecs=opus", terms);
		expect(res).toEqual({ text: "Fake transcript of 5 bytes of audio/webm;codecs=opus.", biased: true });

		const req = fake.requests.at(-1)!;
		expect(req.method).toBe("POST");
		expect(req.url).toBe("/api/dictate");
		expect(req.headers["content-type"]).toBe("audio/webm;codecs=opus");
		expect(req.headers.authorization).toBe(`Bearer ${fake.token}`);
		expect(req.headers["x-vocabulary"]).toBe(encodeURIComponent(JSON.stringify(terms)));
		expect(req.vocabulary).toEqual(terms);
		expect([...req.body]).toEqual([1, 2, 3, 4, 5]);
	});

	it("sends whatever MIME type the platform produced, not a preferred one", async () => {
		await loam().transcribe(audio, "audio/mp4", []);
		expect(fake.requests.at(-1)!.headers["content-type"]).toBe("audio/mp4");
	});

	it("reports biased false when the server says so", async () => {
		const res = await loam().transcribe(audio, "audio/webm", []);
		expect(res.biased).toBe(false);
	});

	it("joins the server address and path whatever the trailing slashes", () => {
		expect(dictateUrl("https://loam.example.net/")).toBe("https://loam.example.net/api/dictate");
		expect(dictateUrl(" https://loam.example.net ")).toBe("https://loam.example.net/api/dictate");
	});

	it("does not call the server when the address or token is missing", async () => {
		const before = fake.requests.length;
		expect((await failure(loam(fake.url, "").transcribe(audio, "audio/webm", []))).message).toBe(NOT_CONFIGURED);
		expect((await failure(loam("", fake.token).transcribe(audio, "audio/webm", []))).message).toBe(NOT_CONFIGURED);
		expect(fake.requests.length).toBe(before);
	});
});

describe("each error status shows the server's sentence", () => {
	const statuses = [400, 401, 413, 415, 422, 429, 502, 503, 504];
	for (const status of statuses) {
		it(`${status}: the sentence from {error} is shown as it is`, async () => {
			const sentence = `The server's own sentence for ${status}.`;
			fake.respondNext(status, { error: sentence });
			const e = await failure(loam().transcribe(audio, "audio/webm", []));
			expect(e.message).toBe(sentence);
			expect(e.status).toBe(status);
		});
		it(`${status}: without a sentence, a plain one of ours, never a bare code`, async () => {
			fake.respondNext(status, "<html>Bad gateway</html>");
			const e = await failure(loam().transcribe(audio, "audio/webm", []));
			expect(e.message).toBe(FALLBACK[status]);
			expect(e.message).not.toMatch(/^\d+$/);
		});
	}

	it("401 from the fake itself when the token is wrong", async () => {
		const e = await failure(loam(fake.url, "wrong-token").transcribe(audio, "audio/webm", []));
		expect(e.status).toBe(401);
		expect(e.message).toBe("That token isn't recognised by Loam.");
	});

	it("400 from the fake itself for an empty take", async () => {
		const e = await failure(loam().transcribe(new ArrayBuffer(0), "audio/webm", []));
		expect(e.status).toBe(400);
		expect(e.message).toBe("The recording was empty.");
	});

	it("415 from the fake itself for a type that isn't audio", async () => {
		const e = await failure(loam().transcribe(audio, "text/plain", []));
		expect(e.status).toBe(415);
	});

	it("a server that cannot be reached says so and keeps the take", async () => {
		const e = await failure(loam("http://127.0.0.1:9").transcribe(audio, "audio/webm", []));
		expect(e.message).toBe(UNREACHABLE);
		expect(e.status).toBe(0);
	});

	it("a server slower than the wait gives up with a sentence", async () => {
		fake.respondNext(200, { text: "late", biased: false, model: "x" }, 500);
		const e = await failure(loam(fake.url, fake.token, 50).transcribe(audio, "audio/webm", []));
		expect(e.message).toBe(TOO_SLOW);
	});

	it("a 200 without text is not taken as a transcript", async () => {
		fake.respondNext(200, { biased: true });
		const e = await failure(loam().transcribe(audio, "audio/webm", []));
		expect(e.message).toMatch(/isn't a transcript/);
	});
});
