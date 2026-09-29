// A fake of Loam UI's dictation route, POST /api/dictate, as written down in
// docs/dictate-route.md. The tests start it in-process; `npm run fake` runs it
// on its own so a test vault can point at it.
//
// The token is a fixture and obviously fake: FAKE_TOKEN below.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export const FAKE_TOKEN = "fake-token-not-a-secret";
export const MAX_BYTES = 12 * 1024 * 1024;

/**
 * @param {{ token?: string, port?: number, host?: string }} [opts]
 */
export async function startFake(opts = {}) {
	const token = opts.token ?? FAKE_TOKEN;
	/** @type {Array<{method: string, url: string, headers: import("node:http").IncomingHttpHeaders, body: Buffer, vocabulary: unknown}>} */
	const requests = [];
	/** @type {Array<{status: number, body: unknown, delayMs?: number}>} */
	const scripted = [];

	const server = createServer((req, res) => {
		const chunks = [];
		let size = 0;
		req.on("data", (c) => {
			size += c.length;
			if (size <= MAX_BYTES + 1) chunks.push(c);
		});
		req.on("end", () => {
			const body = Buffer.concat(chunks);
			let vocabulary = null;
			try {
				vocabulary = JSON.parse(decodeURIComponent(String(req.headers["x-vocabulary"] ?? "[]")));
			} catch {
				vocabulary = undefined;
			}
			requests.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers, body, vocabulary });

			const send = (status, payload, delayMs = 0) =>
				setTimeout(() => {
					if (res.destroyed) return;
					res.writeHead(status, { "Content-Type": "application/json" });
					res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
				}, delayMs);

			if (req.method !== "POST" || req.url !== "/api/dictate") return send(404, { error: "Not found." });
			if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: "That token isn't recognised by Loam." });
			const next = scripted.shift();
			if (next) return send(next.status, next.body, next.delayMs);
			if (size === 0) return send(400, { error: "The recording was empty." });
			if (size > MAX_BYTES) return send(413, { error: "The recording is over 12 MB." });
			const type = String(req.headers["content-type"] ?? "");
			if (!type.startsWith("audio/")) return send(415, { error: `Loam can't read ${type || "audio without a type"}.` });
			if (!Array.isArray(vocabulary)) return send(400, { error: "The vocabulary header isn't a JSON list." });
			send(200, {
				text: `Fake transcript of ${size} bytes of ${type}.`,
				biased: vocabulary.length > 0,
				model: "fake-transcribe",
			});
		});
	});

	await new Promise((resolve) => server.listen(opts.port ?? 0, opts.host ?? "127.0.0.1", () => resolve(undefined)));
	const address = /** @type {import("node:net").AddressInfo} */ (server.address());
	return {
		url: `http://${address.address}:${address.port}`,
		token,
		requests,
		/** The next request gets this answer instead, after any auth check. */
		respondNext(status, body, delayMs = 0) {
			scripted.push({ status, body, delayMs });
		},
		close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve(undefined)); }),
	};
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	const port = Number(process.env.PORT ?? 8787);
	const host = process.env.HOST ?? "127.0.0.1";
	const fake = await startFake({ port, host });
	console.log(`Fake Loam dictation route at ${fake.url}/api/dictate`);
	console.log(`Server address: ${fake.url}   Token: ${fake.token}`);
}
