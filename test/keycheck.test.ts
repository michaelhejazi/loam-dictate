import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	CHECK_NO_KEY,
	CHECK_REFUSED,
	CHECK_UNREACHABLE,
	checkGeminiKey,
	checkUnknownModel,
	checkBothWork,
	checkUnknownPolishModel,
	checkWorks,
	keyCheckRequest,
} from "../src/keycheck";
import { FakeGemini, startFakeGemini } from "./fake-gemini.mjs";
import { fetchClient } from "./fetch-client";

let fake: FakeGemini;
let base: string;
beforeAll(async () => {
	fake = await startFakeGemini();
	base = fake.url.replace("/interactions", "/models");
});
afterAll(() => fake.close());

const check = (key: string, model = "gemini-3.5-transcribe", at = base) => checkGeminiKey(key, model, fetchClient, 2_000, at);

/** An address where nothing listens: a port that was free a moment ago. */
async function deadAddress(): Promise<string> {
	const s = createServer();
	await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
	const { port } = s.address() as { port: number };
	await new Promise<void>((r) => s.close(() => r()));
	return `http://127.0.0.1:${port}/v1beta/models`;
}

describe("Check key", () => {
	it("sends one GET for the model's own record, the key in a header and never in the URL", async () => {
		await check(fake.key);
		const req = fake.requests.at(-1)!;
		expect(req.method).toBe("GET");
		expect(req.url).toBe("/v1beta/models/gemini-3.5-transcribe");
		expect(req.headers["x-goog-api-key"]).toBe(fake.key);
		expect(req.url).not.toContain(fake.key);
		expect(req.json).toBeNull();
		expect(keyCheckRequest("k-not-a-secret", "models/gemini-3.5-transcribe")).toEqual({
			url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe",
			method: "GET",
			headers: { "x-goog-api-key": "k-not-a-secret" },
			throw: false,
		});
	});

	it("the key works and the model exists", async () => {
		expect(await check(fake.key)).toEqual({ outcome: "works", sentence: checkWorks("gemini-3.5-transcribe") });
	});

	it("the key is refused (Google's 400 API key not valid)", async () => {
		expect(await check("wrong-key-not-a-secret")).toEqual({ outcome: "refused", sentence: CHECK_REFUSED });
	});

	it("the model is unknown", async () => {
		expect(await check(fake.key, "gemini-0-nonesuch")).toEqual({
			outcome: "unknown model",
			sentence: checkUnknownModel("gemini-0-nonesuch"),
		});
		expect(fake.requests.at(-1)!.url).toBe("/v1beta/models/gemini-0-nonesuch");
	});

	it("Google could not be reached", async () => {
		expect(await check(fake.key, "gemini-3.5-transcribe", await deadAddress())).toEqual({
			outcome: "unreachable",
			sentence: CHECK_UNREACHABLE,
		});
	});

	it("no key: nothing is sent", async () => {
		const before = fake.requests.length;
		expect(await check("  ")).toEqual({ outcome: "no key", sentence: CHECK_NO_KEY });
		expect(fake.requests.length).toBe(before);
	});

	it("a blank model checks the default; any other error is Google's own sentence", async () => {
		expect((await check(fake.key, "")).outcome).toBe("works");
		fake.respondNext(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded." } });
		expect(await check(fake.key)).toEqual({ outcome: "other", sentence: "Google answered: Quota exceeded." });
	});
});

describe("Check key, with the polish model", () => {
	const both = (key: string, model: string, polishModel: string) => checkGeminiKey(key, model, fetchClient, 2_000, base, polishModel);

	it("checks both models in the one press, and says both exist", async () => {
		const before = fake.requests.length;
		expect(await both(fake.key, "gemini-3.5-transcribe", "gemini-3.5-flash-lite")).toEqual({
			outcome: "works",
			sentence: checkBothWork("gemini-3.5-transcribe", "gemini-3.5-flash-lite"),
		});
		expect(fake.requests.slice(before).map((r) => r.url)).toEqual(["/v1beta/models/gemini-3.5-transcribe", "/v1beta/models/gemini-3.5-flash-lite"]);
	});

	it("names the polish model when Google has no such model", async () => {
		expect(await both(fake.key, "gemini-3.5-transcribe", "gemini-0-nonesuch")).toEqual({
			outcome: "unknown model",
			sentence: checkUnknownPolishModel("gemini-0-nonesuch"),
		});
	});

	it("a refused key is said once, without checking the polish model", async () => {
		const before = fake.requests.length;
		expect(await both("wrong-key-not-a-secret", "gemini-3.5-transcribe", "gemini-3.5-flash-lite")).toEqual({ outcome: "refused", sentence: CHECK_REFUSED });
		expect(fake.requests.length).toBe(before + 1);
	});
});
