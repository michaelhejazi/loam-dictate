import { afterEach, describe, expect, it } from "vitest";
import { BITS_PER_SECOND, PREFERRED_MIME, RecorderCancelled, mediaRecorderFactory, microphoneError } from "../src/recorder";
import { FakeRecorder, fakeMic } from "./fake-media";

afterEach(() => {
	FakeRecorder.supported = new Set([PREFERRED_MIME]);
});

describe("the recorder", () => {
	it("is null where there is no MediaRecorder", () => {
		expect(mediaRecorderFactory(() => fakeMic({ mediaRecorder: false }).env)()).toBeNull();
	});

	it("is null where there is no getUserMedia", () => {
		expect(mediaRecorderFactory(() => fakeMic({ getUserMedia: false }).env)()).toBeNull();
	});

	it("asks for Opus in WebM at 32 kbit/s where offered, and hands back the real type", async () => {
		const mic = fakeMic();
		const r = mediaRecorderFactory(() => mic.env)()!;
		await r.start();
		expect(mic.recorders[0].options).toEqual({ audioBitsPerSecond: BITS_PER_SECOND, mimeType: PREFERRED_MIME });
		const take = await r.stop();
		expect(take.mimeType).toBe(PREFERRED_MIME);
		expect([...new Uint8Array(take.audio)]).toEqual([7, 7, 7]);
		expect(mic.released()).toBe(true);
	});

	it("takes whatever the platform gives when Opus in WebM isn't offered", async () => {
		FakeRecorder.supported = new Set();
		const mic = fakeMic();
		const r = mediaRecorderFactory(() => mic.env)()!;
		await r.start();
		expect(mic.recorders[0].options).toEqual({ audioBitsPerSecond: BITS_PER_SECOND });
		expect((await r.stop()).mimeType).toBe("audio/mp4");
	});

	it("release stops the microphone and is safe twice", async () => {
		const mic = fakeMic();
		const r = mediaRecorderFactory(() => mic.env)()!;
		await r.start();
		expect(mic.released()).toBe(false);
		r.release();
		r.release();
		expect(mic.released()).toBe(true);
		expect(mic.recorders[0].state).toBe("inactive");
	});

	it("released while the permission prompt is up, it lets the microphone go the moment it arrives", async () => {
		const mic = fakeMic();
		const grant = mic.holdPermission();
		const r = mediaRecorderFactory(() => mic.env)()!;
		const started = r.start();
		r.release();
		grant();
		await expect(started).rejects.toBeInstanceOf(RecorderCancelled);
		expect(mic.tracks).toHaveLength(1);
		expect(mic.released()).toBe(true);
	});

	it("names a refused microphone plainly", () => {
		expect(microphoneError({ name: "NotAllowedError" })).toMatch(/isn't allowed to use the microphone/);
		expect(microphoneError({ name: "NotFoundError" })).toBe("No microphone was found.");
		expect(microphoneError(new Error("?"))).toBe("The microphone couldn't be started.");
	});
});
