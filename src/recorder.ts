// Recording through the browser's media APIs, which both Obsidian apps provide:
// MediaRecorder over getUserMedia, Opus in WebM at 32 kbit/s where offered.

export interface Recording {
	audio: ArrayBuffer;
	/** The type the recorder really produced; this is what gets sent. */
	mimeType: string;
}

export interface Recorder {
	/** Asks for the microphone and starts recording. */
	start(): Promise<void>;
	/** Stops, releases the microphone and hands back the take. */
	stop(): Promise<Recording>;
	/** Releases the microphone and throws the take away. Safe to call any time, more than once. */
	release(): void;
	/** Input loudness now, 0..1, for the wave. */
	level(): number;
	/** Called if recording fails after it started. */
	onError: ((message: string) => void) | null;
}

/** Returns null when the platform cannot record. */
export type RecorderFactory = () => Recorder | null;

export const PREFERRED_MIME = "audio/webm;codecs=opus";
export const BITS_PER_SECOND = 32_000;

/** What of the browser this needs, so tests can hand in fakes. */
export interface MediaEnv {
	mediaDevices?: Pick<MediaDevices, "getUserMedia">;
	MediaRecorder?: typeof MediaRecorder;
	AudioContext?: typeof AudioContext;
}

export function browserEnv(): MediaEnv {
	const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
	return {
		mediaDevices: navigator.mediaDevices,
		MediaRecorder: typeof MediaRecorder === "undefined" ? undefined : MediaRecorder,
		AudioContext: w.AudioContext ?? w.webkitAudioContext,
	};
}

export function mediaRecorderFactory(env: () => MediaEnv = browserEnv): RecorderFactory {
	return () => {
		const e = env();
		if (!e.MediaRecorder || !e.mediaDevices || typeof e.mediaDevices.getUserMedia !== "function") return null;
		return new MediaRecorderRecorder(e as Required<Pick<MediaEnv, "mediaDevices" | "MediaRecorder">> & MediaEnv);
	};
}

export class RecorderCancelled extends Error {
	constructor() {
		super("Recording was cancelled.");
		this.name = "RecorderCancelled";
	}
}

class MediaRecorderRecorder implements Recorder {
	onError: ((message: string) => void) | null = null;
	private stream: MediaStream | null = null;
	private recorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private audioCtx: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private samples: Uint8Array<ArrayBuffer> | null = null;
	private released = false;

	constructor(private readonly env: Required<Pick<MediaEnv, "mediaDevices" | "MediaRecorder">> & MediaEnv) {}

	async start(): Promise<void> {
		const stream = await this.env.mediaDevices.getUserMedia({ audio: true });
		if (this.released) {
			// Closed while the permission prompt was up: let go at once.
			stopTracks(stream);
			throw new RecorderCancelled();
		}
		this.stream = stream;
		const MR = this.env.MediaRecorder;
		const options: MediaRecorderOptions = { audioBitsPerSecond: BITS_PER_SECOND };
		if (typeof MR.isTypeSupported === "function" && MR.isTypeSupported(PREFERRED_MIME)) options.mimeType = PREFERRED_MIME;
		const recorder = new MR(stream, options);
		this.recorder = recorder;
		recorder.ondataavailable = (ev: BlobEvent) => {
			if (ev.data && ev.data.size > 0) this.chunks.push(ev.data);
		};
		recorder.onerror = () => {
			const cb = this.onError;
			this.release();
			cb?.("Recording stopped because the microphone failed.");
		};
		recorder.start(1000);
		this.watchLevel(stream);
	}

	stop(): Promise<Recording> {
		const recorder = this.recorder;
		if (!recorder || this.released) return Promise.reject(new RecorderCancelled());
		return new Promise<Recording>((resolve, reject) => {
			recorder.onstop = () => {
				const mimeType = recorder.mimeType || this.chunks[0]?.type || PREFERRED_MIME;
				const blob = new Blob(this.chunks, { type: mimeType });
				this.release();
				blob.arrayBuffer().then((audio) => resolve({ audio, mimeType }), reject);
			};
			if (recorder.state === "inactive") recorder.onstop(new Event("stop"));
			else recorder.stop();
		});
	}

	release(): void {
		this.released = true;
		if (this.recorder) {
			this.recorder.ondataavailable = null;
			this.recorder.onerror = null;
			if (this.recorder.state !== "inactive") {
				this.recorder.onstop = null;
				try {
					this.recorder.stop();
				} catch {
					// already stopping
				}
			}
			this.recorder = null;
		}
		if (this.stream) {
			stopTracks(this.stream);
			this.stream = null;
		}
		if (this.audioCtx) {
			void this.audioCtx.close().catch(() => undefined);
			this.audioCtx = null;
			this.analyser = null;
		}
		this.chunks = [];
		this.onError = null;
	}

	level(): number {
		if (!this.analyser || !this.samples) return 0;
		this.analyser.getByteTimeDomainData(this.samples);
		let peak = 0;
		for (const s of this.samples) peak = Math.max(peak, Math.abs(s - 128));
		return Math.min(1, peak / 96);
	}

	private watchLevel(stream: MediaStream): void {
		const AC = this.env.AudioContext;
		if (!AC) return;
		try {
			this.audioCtx = new AC();
			this.analyser = this.audioCtx.createAnalyser();
			this.analyser.fftSize = 512;
			this.samples = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
			this.audioCtx.createMediaStreamSource(stream).connect(this.analyser);
		} catch {
			// The wave is decoration; recording goes on without it.
			this.audioCtx = null;
			this.analyser = null;
		}
	}
}

function stopTracks(stream: MediaStream): void {
	for (const track of stream.getTracks()) track.stop();
}

/** A sentence for a getUserMedia failure. */
export function microphoneError(e: unknown): string {
	const name = e instanceof Error || (e && typeof e === "object" && "name" in e) ? String(e.name) : "";
	if (name === "NotAllowedError" || name === "SecurityError") return "Obsidian isn't allowed to use the microphone. Allow it in the phone's settings for Obsidian, then try again.";
	if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found.";
	if (name === "NotReadableError") return "The microphone is in use by another app.";
	return "The microphone couldn't be started.";
}
