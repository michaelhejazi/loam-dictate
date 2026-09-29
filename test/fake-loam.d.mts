export declare const FAKE_TOKEN: string;
export declare const MAX_BYTES: number;
export interface FakeRequest {
	method: string;
	url: string;
	headers: Record<string, string | string[] | undefined>;
	body: Buffer;
	vocabulary: unknown;
}
export interface Fake {
	url: string;
	token: string;
	requests: FakeRequest[];
	respondNext(status: number, body: unknown, delayMs?: number): void;
	close(): Promise<void>;
}
export declare function startFake(opts?: { token?: string; port?: number; host?: string }): Promise<Fake>;
