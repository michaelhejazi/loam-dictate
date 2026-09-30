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

/** The settings are read at each request, so a change applies to the next Try again. */
export function makeTranscriber(settings: () => ProviderSettings, http: HttpClient): Transcriber {
	if (settings().provider === "loam") {
		return new LoamTranscriber(() => ({ server: settings().server, token: settings().token }), http);
	}
	return new GeminiTranscriber(() => ({ key: settings().geminiKey, model: settings().geminiModel }), http);
}
