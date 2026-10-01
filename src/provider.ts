// Who turns the take into words. The one place a Transcriber is constructed;
// the sheet and the session know only the Transcriber interface.

import { GeminiTranscriber } from "./gemini";
import { HttpClient } from "./http";
import { LoamTranscriber } from "./loam";
import { Transcriber } from "./transcriber";

export type Provider = "gemini" | "loam";

export const PROVIDERS: Record<Provider, string> = {
	gemini: "Gemini, your own key",
	loam: "A Loam server",
};

export interface ProviderSettings {
	provider: Provider;
	geminiKey: string;
	geminiModel: string;
	server: string;
	token: string;
}

/**
 * The providers the settings tab offers. Gemini with the user's own key always;
 * Loam only to an install that already has a Loam address or token saved (or
 * has Loam chosen), so a fresh install never sees it. LoamTranscriber itself is
 * unchanged: it is the door to a hosted version later.
 */
export function visibleProviders(s: ProviderSettings): Provider[] {
	const hasLoam = s.provider === "loam" || Boolean(s.server.trim() || s.token.trim());
	return hasLoam ? ["gemini", "loam"] : ["gemini"];
}

/** The settings are read at each request, so a change applies to the next Try again. */
export function makeTranscriber(settings: () => ProviderSettings, http: HttpClient): Transcriber {
	if (settings().provider === "loam") {
		return new LoamTranscriber(() => ({ server: settings().server, token: settings().token }), http);
	}
	return new GeminiTranscriber(() => ({ key: settings().geminiKey, model: settings().geminiModel }), http);
}
