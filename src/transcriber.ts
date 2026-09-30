// The one seam between the sheet and whoever turns audio into words.
// The sheet knows only this interface; makeTranscriber() in src/provider.ts
// constructs GeminiTranscriber (src/gemini.ts) or LoamTranscriber
// (src/loam.ts) from the provider setting. Another provider is another class
// there and touches nothing in the sheet.

export interface Transcript {
	/** The cleaned words. */
	text: string;
	/** Whether the names and terms were used to bias the transcription. */
	biased: boolean;
}

export interface Transcriber {
	transcribe(audio: ArrayBuffer, mimeType: string, terms: string[]): Promise<Transcript>;
}

/** A failure with the sentence to show the user as it is. Never a bare code. */
export class TranscribeError extends Error {
	constructor(
		message: string,
		/** HTTP status, or 0 when the server was not reached or did not answer in time. */
		readonly status: number,
	) {
		super(message);
		this.name = "TranscribeError";
	}
}
