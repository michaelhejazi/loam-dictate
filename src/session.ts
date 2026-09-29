// One take, from the first tap to the words landing or being thrown away.
// The sheet (src/modal.ts) draws whatever phase this is in and forwards the
// buttons here; nothing in this file touches the DOM or Obsidian, so every
// path through it is tested without a device.

import { Recorder, RecorderCancelled, RecorderFactory, Recording, microphoneError } from "./recorder";
import { Transcriber, TranscribeError } from "./transcriber";

export const WARN_BEFORE_CAP_MS = 30_000;
export const TICK_MS = 200;
export const CANNOT_RECORD = "This device can't record audio in Obsidian, so there is nothing to dictate with here.";

export type Phase =
	| { kind: "unsupported"; message: string }
	| { kind: "starting" }
	| { kind: "recording"; elapsedMs: number; warning: boolean }
	| { kind: "cleaning"; durationMs: number }
	| { kind: "ready"; text: string; biased: boolean; durationMs: number; targetGone: boolean }
	/** Not cleaned. With the take kept, Try again resends it; without one, it records afresh. */
	| { kind: "failed"; message: string; durationMs: number; takeKept: boolean }
	| { kind: "closed" };

export interface Clock {
	now(): number;
	every(ms: number, fn: () => void): () => void;
}

export const realClock: Clock = {
	now: () => Date.now(),
	every: (ms, fn) => {
		const id = window.setInterval(fn, ms);
		return () => window.clearInterval(id);
	},
};

export interface SessionDeps {
	recorders: RecorderFactory;
	transcriber: Transcriber;
	/** Read when a take is sent, so the list reflects the note as it is then. */
	terms: () => string[];
	capMs: number;
	clock: Clock;
	/** Buzz once; a no-op where the platform has no vibration. */
	buzz: () => void;
}

export class DictationSession {
	private _phase: Phase = { kind: "starting" };
	private recorder: Recorder | null = null;
	private stopTicking: (() => void) | null = null;
	private startedAt = 0;
	private warned = false;
	private take: Recording | null = null;
	private durationMs = 0;
	/** Bumped on every way out of a phase, so late answers from an old one are ignored. */
	private generation = 0;
	private listeners: Array<(p: Phase) => void> = [];
	termsSent = 0;

	constructor(private readonly deps: SessionDeps) {}

	get phase(): Phase {
		return this._phase;
	}

	onChange(fn: (p: Phase) => void): void {
		this.listeners.push(fn);
	}

	/** Input loudness now, 0..1, while recording. */
	level(): number {
		return this._phase.kind === "recording" && this.recorder ? this.recorder.level() : 0;
	}

	/** Starts a fresh recording. Also Retake, and Try again when there is no take to resend. */
	async record(): Promise<void> {
		if (this._phase.kind === "closed") return;
		this.letGo();
		this.take = null;
		this.durationMs = 0;
		this.warned = false;
		const gen = ++this.generation;

		const recorder = this.deps.recorders();
		if (!recorder) {
			this.set({ kind: "unsupported", message: CANNOT_RECORD });
			return;
		}
		this.recorder = recorder;
		recorder.onError = (message) => {
			if (gen !== this.generation) return;
			const durationMs = this.elapsed();
			this.letGo();
			this.set({ kind: "failed", message, durationMs, takeKept: false });
		};
		this.set({ kind: "starting" });
		try {
			await recorder.start();
		} catch (e) {
			if (gen !== this.generation || e instanceof RecorderCancelled) return;
			this.letGo();
			this.set({ kind: "failed", message: microphoneError(e), durationMs: 0, takeKept: false });
			return;
		}
		if (gen !== this.generation) {
			recorder.release();
			return;
		}
		this.startedAt = this.deps.clock.now();
		this.stopTicking = this.deps.clock.every(TICK_MS, () => this.tick());
		this.set({ kind: "recording", elapsedMs: 0, warning: false });
	}

	/** Stop: the take goes to be cleaned. */
	async stop(): Promise<void> {
		if (this._phase.kind !== "recording" || !this.recorder) return;
		const recorder = this.recorder;
		this.durationMs = this.elapsed();
		this.stopClock();
		const gen = ++this.generation;
		this.set({ kind: "cleaning", durationMs: this.durationMs });
		let take: Recording;
		try {
			take = await recorder.stop();
		} catch {
			recorder.release();
			if (gen !== this.generation) return;
			this.recorder = null;
			this.set({ kind: "failed", message: "The recording couldn't be finished.", durationMs: this.durationMs, takeKept: false });
			return;
		}
		recorder.release();
		if (this.recorder === recorder) this.recorder = null;
		if (gen !== this.generation) return;
		this.take = take;
		await this.clean(gen);
	}

	/** Try again: resend the kept take, or record afresh if there is none. */
	async retry(): Promise<void> {
		if (this._phase.kind !== "failed") return;
		if (!this.take) return this.record();
		const gen = ++this.generation;
		this.set({ kind: "cleaning", durationMs: this.durationMs });
		await this.clean(gen);
	}

	/** Retake: throw the words away and record again. */
	retake(): Promise<void> {
		return this.record();
	}

	/** Insert was pressed but the editor is no longer there: keep the words, offer Copy. */
	targetGone(): void {
		if (this._phase.kind === "ready") this.set({ ...this._phase, targetGone: true });
	}

	/** Every way out — Cancel, Discard, Insert done, the sheet closing, the plugin unloading. */
	close(): void {
		if (this._phase.kind === "closed") return;
		this.generation++;
		this.letGo();
		this.take = null;
		this.set({ kind: "closed" });
		this.listeners = [];
	}

	private async clean(gen: number): Promise<void> {
		const take = this.take;
		if (!take) return;
		const terms = this.deps.terms();
		this.termsSent = terms.length;
		try {
			const result = await this.deps.transcriber.transcribe(take.audio, take.mimeType, terms);
			if (gen !== this.generation) return;
			this.set({ kind: "ready", text: result.text, biased: result.biased, durationMs: this.durationMs, targetGone: false });
		} catch (e) {
			if (gen !== this.generation) return;
			const message = e instanceof TranscribeError ? e.message : "The recording couldn't be cleaned.";
			this.set({ kind: "failed", message, durationMs: this.durationMs, takeKept: true });
		}
	}

	private tick(): void {
		if (this._phase.kind !== "recording") return;
		const elapsedMs = this.elapsed();
		if (elapsedMs >= this.deps.capMs) {
			void this.stop();
			return;
		}
		const warning = elapsedMs >= this.deps.capMs - WARN_BEFORE_CAP_MS;
		if (warning && !this.warned) {
			this.warned = true;
			this.deps.buzz();
		}
		this.set({ kind: "recording", elapsedMs, warning });
	}

	private elapsed(): number {
		return this.startedAt ? this.deps.clock.now() - this.startedAt : 0;
	}

	private stopClock(): void {
		this.stopTicking?.();
		this.stopTicking = null;
	}

	/** Stops the clock and releases the microphone, whatever state it is in. */
	private letGo(): void {
		this.stopClock();
		this.startedAt = 0;
		if (this.recorder) {
			this.recorder.release();
			this.recorder = null;
		}
	}

	private set(p: Phase): void {
		this._phase = p;
		for (const fn of this.listeners) fn(p);
	}
}
