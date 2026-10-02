// Who turns the take into words. The one place a Transcriber is constructed;
// the sheet and the session know only the Transcriber interface.

import { GeminiTranscriber } from "./gemini";
import { HttpClient } from "./http";
import { GeminiPolisher, Polisher } from "./polish";
import { Transcriber } from "./transcriber";

export type Provider = "gemini";

export const PROVIDERS: Record<Provider, string> = {
	gemini: "Gemini, your own key",
};

export interface ProviderSettings {
	provider: Provider;
	geminiKey: string;
	geminiModel: string;
	polishModel: string;
}

/** The providers the settings tab offers. With one there is nothing to choose. */
export function visibleProviders(): Provider[] {
	return Object.keys(PROVIDERS) as Provider[];
}

/** The settings are read at each request, so a change applies to the next Try again. */
export function makeTranscriber(settings: () => ProviderSettings, http: HttpClient): Transcriber {
	return new GeminiTranscriber(() => ({ key: settings().geminiKey, model: settings().geminiModel }), http);
}

/** Polish goes on the same key as the transcript, to the polish model. */
export function makePolisher(settings: () => ProviderSettings, http: HttpClient): Polisher {
	return new GeminiPolisher(() => ({ key: settings().geminiKey, model: settings().polishModel }), http);
}
