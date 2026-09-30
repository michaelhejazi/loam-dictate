// The names and terms sent with a take: the terms note first (src/termsnote.ts),
// then the open note's title and its headings. Each once regardless of case, none over 80
// characters, at most 100 terms and at most 6,000 bytes once encoded for the
// x-vocabulary header, cut from the end. Gemini takes up to 1,000 terms and
// its model page advises up to 100, so its cap is not lower than these.

export const MAX_TERM_CHARS = 80;
export const MAX_TERMS = 100;
export const MAX_ENCODED_BYTES = 6000;

export function encodeTerms(terms: string[]): string {
	return encodeURIComponent(JSON.stringify(terms));
}

export function buildTerms(userTerms: string[], title: string | null, headings: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of [...userTerms, ...(title ? [title] : []), ...headings]) {
		const term = raw.trim();
		if (!term || term.length > MAX_TERM_CHARS) continue;
		const key = term.toLocaleLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(term);
		if (out.length === MAX_TERMS) break;
	}
	while (out.length && encodeTerms(out).length > MAX_ENCODED_BYTES) out.pop();
	return out;
}
