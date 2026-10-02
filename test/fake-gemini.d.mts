export declare const FAKE_GEMINI_KEY: string;
export declare const PATH: string;
export declare const MODELS_PATH: string;
export declare const KNOWN_MODELS: string[];
export declare const MIME_TYPES: string[];
export interface FakeGeminiRequest {
	method: string;
	url: string;
	headers: Record<string, string | string[] | undefined>;
	json: any;
}
export interface FakeGemini {
	url: string;
	key: string;
	requests: FakeGeminiRequest[];
	rejectVocabulary: boolean;
	respondNext(status: number, body: unknown, delayMs?: number): void;
	close(): Promise<void>;
}
export declare function completed(model: string, userSteps: unknown[], text: string): object;
export declare function startFakeGemini(opts?: { key?: string; port?: number; host?: string }): Promise<FakeGemini>;
