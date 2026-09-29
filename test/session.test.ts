import { describe, expect, it } from "vitest";
import { mediaRecorderFactory } from "../src/recorder";
import { CANNOT_RECORD, Clock, DictationSession, Phase, TICK_MS } from "../src/session";
import { Transcriber, TranscribeError, Transcript } from "../src/transcriber";
import { fakeMic } from "./fake-media";

const CAP = 60_000;

function fakeClock() {
	let now = 1_000_000;
	const timers = new Set<{ ms: number; fn: () => void; next: number }>();
	const clock: Clock = {
		now: () => now,
		every: (ms, fn) => {
			const t = { ms, fn, next: now + ms };
			timers.add(t);
			return () => timers.delete(t);
		},
	};
	return {
		clock,
		running: () => timers.size,
		advance(ms: number) {
			const end = now + ms;
			while (true) {
				const due = [...timers].filter((t) => t.next <= end).sort((a, b) => a.next - b.next)[0];
				if (!due) break;
				now = due.next;
				due.next += due.ms;
				due.fn();
			}
			now = end;
		},
	};
}

/** A transcriber whose answers the test hands out. */
function fakeTranscriber() {
	const calls: Array<{ audio: ArrayBuffer; mimeType: string; terms: string[]; resolve: (t: Transcript) => void; reject: (e: unknown) => void }> = [];
	const t: Transcriber = {
		transcribe: (audio, mimeType, terms) =>
			new Promise<Transcript>((resolve, reject) => calls.push({ audio, mimeType, terms, resolve, reject })),
	};
	return { t, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(opts: { mediaRecorder?: boolean } = {}) {
	const mic = fakeMic(opts);
	const time = fakeClock();
	const tx = fakeTranscriber();
	let buzzes = 0;
	const session = new DictationSession({
		recorders: mediaRecorderFactory(() => mic.env),
		transcriber: tx.t,
		terms: () => ["Simin", "Flyo"],
		capMs: CAP,
		clock: time.clock,
		buzz: () => buzzes++,
	});
	const phases: Phase["kind"][] = [];
	session.onChange((p) => phases.push(p.kind));
	return { mic, time, tx, session, phases, buzzes: () => buzzes };
}

describe("the sheet's session, through every way out", () => {
	it("Stop → cleaning → ready → Insert: the microphone is released at Stop", async () => {
		const s = setup();
		await s.session.record();
		expect(s.session.phase.kind).toBe("recording");
		expect(s.mic.released()).toBe(false);
		s.time.advance(22_000);
		expect(s.session.phase).toEqual({ kind: "recording", elapsedMs: 22_000, warning: false });

		const stopping = s.session.stop();
		expect(s.session.phase).toEqual({ kind: "cleaning", durationMs: 22_000 });
		await flush();
		expect(s.mic.released()).toBe(true);
		expect(s.time.running()).toBe(0);
		expect(s.tx.calls).toHaveLength(1);
		expect(s.tx.calls[0].mimeType).toBe("audio/webm;codecs=opus");
		expect(s.tx.calls[0].terms).toEqual(["Simin", "Flyo"]);
		expect(s.session.termsSent).toBe(2);

		s.tx.calls[0].resolve({ text: "Walked the ridge.", biased: true });
		await stopping;
		expect(s.session.phase).toEqual({ kind: "ready", text: "Walked the ridge.", biased: true, durationMs: 22_000, targetGone: false });

		s.session.close(); // Insert closes the sheet once the words are in.
		expect(s.session.phase.kind).toBe("closed");
		expect(s.mic.released()).toBe(true);
	});

	it("Cancel while recording releases the microphone and sends nothing", async () => {
		const s = setup();
		await s.session.record();
		s.time.advance(5_000);
		s.session.close();
		expect(s.session.phase.kind).toBe("closed");
		expect(s.mic.released()).toBe(true);
		expect(s.time.running()).toBe(0);
		await flush();
		expect(s.tx.calls).toHaveLength(0);
	});

	it("closing while the permission prompt is up releases the microphone when it arrives", async () => {
		const s = setup();
		const grant = s.mic.holdPermission();
		const recording = s.session.record();
		expect(s.session.phase.kind).toBe("starting");
		s.session.close();
		grant();
		await recording;
		expect(s.session.phase.kind).toBe("closed");
		expect(s.mic.tracks).toHaveLength(1);
		expect(s.mic.released()).toBe(true);
		expect(s.time.running()).toBe(0);
	});

	it("a refused microphone is a sentence, not a crash; Try again asks again", async () => {
		const s = setup();
		s.mic.denyNext("NotAllowedError");
		await s.session.record();
		const p = s.session.phase;
		expect(p.kind).toBe("failed");
		if (p.kind === "failed") {
			expect(p.message).toMatch(/isn't allowed to use the microphone/);
			expect(p.takeKept).toBe(false);
		}
		await s.session.retry();
		expect(s.session.phase.kind).toBe("recording");
		s.session.close();
		expect(s.mic.released()).toBe(true);
	});

	it("a recorder error mid-take releases the microphone and says so", async () => {
		const s = setup();
		await s.session.record();
		s.time.advance(3_000);
		s.mic.recorders[0].fail();
		const p = s.session.phase;
		expect(p).toEqual({ kind: "failed", message: "Recording stopped because the microphone failed.", durationMs: 3_000, takeKept: false });
		expect(s.mic.released()).toBe(true);
		expect(s.time.running()).toBe(0);
		s.session.close();
	});

	it("thirty seconds before the cap it warns and buzzes once; at the cap it stops by itself", async () => {
		const s = setup();
		await s.session.record();
		s.time.advance(CAP - 30_000 - TICK_MS);
		expect(s.session.phase).toMatchObject({ kind: "recording", warning: false });
		expect(s.buzzes()).toBe(0);
		s.time.advance(TICK_MS);
		expect(s.session.phase).toMatchObject({ kind: "recording", warning: true });
		expect(s.buzzes()).toBe(1);
		s.time.advance(20_000);
		expect(s.buzzes()).toBe(1);
		s.time.advance(10_000);
		expect(s.session.phase).toEqual({ kind: "cleaning", durationMs: CAP });
		await flush();
		expect(s.mic.released()).toBe(true);
		expect(s.tx.calls).toHaveLength(1);
		s.session.close();
	});

	it("Cancel while cleaning throws the take away; a late answer changes nothing", async () => {
		const s = setup();
		await s.session.record();
		const stopping = s.session.stop();
		await flush();
		s.session.close();
		s.tx.calls[0].resolve({ text: "too late", biased: false });
		await stopping;
		expect(s.session.phase.kind).toBe("closed");
		expect(s.mic.released()).toBe(true);
	});

	it("not cleaned keeps the take; Try again resends the same audio", async () => {
		const s = setup();
		await s.session.record();
		s.time.advance(8_000);
		const stopping = s.session.stop();
		await flush();
		s.tx.calls[0].reject(new TranscribeError("Loam couldn't be reached. The recording is still here.", 0));
		await stopping;
		expect(s.session.phase).toEqual({
			kind: "failed",
			message: "Loam couldn't be reached. The recording is still here.",
			durationMs: 8_000,
			takeKept: true,
		});
		expect(s.mic.released()).toBe(true);

		const retrying = s.session.retry();
		expect(s.session.phase.kind).toBe("cleaning");
		await flush();
		expect(s.tx.calls).toHaveLength(2);
		expect(s.tx.calls[1].audio).toBe(s.tx.calls[0].audio);
		expect(s.mic.tracks).toHaveLength(1); // no new recording
		s.tx.calls[1].resolve({ text: "Here now.", biased: false });
		await retrying;
		expect(s.session.phase.kind).toBe("ready");
		s.session.close();
	});

	it("Retake records afresh; closing then releases the new microphone too", async () => {
		const s = setup();
		await s.session.record();
		const stopping = s.session.stop();
		await flush();
		s.tx.calls[0].resolve({ text: "First go.", biased: false });
		await stopping;
		await s.session.retake();
		expect(s.session.phase).toEqual({ kind: "recording", elapsedMs: 0, warning: false });
		expect(s.mic.tracks).toHaveLength(2);
		expect(s.mic.tracks[0].stopped).toBe(true);
		expect(s.mic.tracks[1].stopped).toBe(false);
		s.session.close();
		expect(s.mic.released()).toBe(true);
	});

	it("an editor gone at Insert keeps the words and marks the target gone", async () => {
		const s = setup();
		await s.session.record();
		const stopping = s.session.stop();
		await flush();
		s.tx.calls[0].resolve({ text: "Keep me.", biased: false });
		await stopping;
		s.session.targetGone();
		expect(s.session.phase).toMatchObject({ kind: "ready", text: "Keep me.", targetGone: true });
		s.session.close();
	});

	it("where the platform cannot record, the session says so instead of failing", async () => {
		const s = setup({ mediaRecorder: false });
		await expect(s.session.record()).resolves.toBeUndefined();
		expect(s.session.phase).toEqual({ kind: "unsupported", message: CANNOT_RECORD });
		expect(s.mic.tracks).toHaveLength(0);
		s.session.close();
		expect(s.session.phase.kind).toBe("closed");
	});
});
