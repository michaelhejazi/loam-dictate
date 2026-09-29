// Stands in for Obsidian's requestUrl in tests: same request fields, same
// { status, text } answer, never throws on an error status.
import type { HttpClient } from "../src/loam";

export const fetchClient: HttpClient = async (req) => {
	const res = await fetch(req.url, {
		method: req.method,
		headers: { ...req.headers, "Content-Type": req.contentType },
		body: req.body,
	});
	return { status: res.status, text: await res.text() };
};
