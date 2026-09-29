// What the phone does so a walker knows where the take is without looking:
// one haptic language, three moments, and no others. Loam UI's app uses the
// same three patterns; this table is the one to check it against.

export type Moment = "started" | "warning" | "cap";

/** Vibration patterns in milliseconds, on/off/on…, as `navigator.vibrate` takes them. */
export const HAPTICS: Readonly<Record<Moment, readonly number[]>> = {
	/** Recording started: one short tap, so the mic is known to be live. */
	started: [40],
	/** Thirty seconds before the cap: two firm pulses, so it can't pass for a notification. */
	warning: [150, 100, 150],
	/** The cap, when the plugin stopped the take itself: one long pulse, then cleaning. */
	cap: [500],
};

/** Where vibration isn't felt, these moments play the same rhythm as a soft tone instead. */
export const TONE_MOMENTS: readonly Moment[] = ["warning", "cap"];
export const TONE_HZ = 660;
export const TONE_GAIN = 0.15;

export interface SignalEnv {
	/** `navigator.vibrate`, or undefined where the platform has none. */
	vibrate?: (pattern: number[]) => boolean;
	/** Plays a pattern (on/off/on…, ms) as a soft tone. */
	tone: (pattern: readonly number[]) => void;
}

/** How the moments reach the user on this device, for the settings tab. */
export type SignalPath = "vibration" | "tone: no vibration" | "tone: vibration refused";

export class Signals {
	private refused = false;

	constructor(private readonly env: () => SignalEnv) {}

	signal(moment: Moment): void {
		const e = this.env();
		let felt = false;
		if (e.vibrate) {
			try {
				felt = e.vibrate([...HAPTICS[moment]]) !== false;
			} catch {
				felt = false;
			}
			if (!felt) this.refused = true;
		}
		if (!felt && TONE_MOMENTS.includes(moment)) e.tone(HAPTICS[moment]);
	}

	path(): SignalPath {
		if (!this.env().vibrate) return "tone: no vibration";
		return this.refused ? "tone: vibration refused" : "vibration";
	}
}

export function browserSignalEnv(): SignalEnv {
	return {
		vibrate: typeof navigator.vibrate === "function" ? (p) => navigator.vibrate(p) : undefined,
		tone: playTone,
	};
}

/** The pattern as short sine beeps through Web Audio; silent where there is no Web Audio. */
export function playTone(pattern: readonly number[]): void {
	const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
	const AC = w.AudioContext ?? w.webkitAudioContext;
	if (!AC) return;
	try {
		const ctx = new AC();
		const gain = ctx.createGain();
		gain.gain.value = 0;
		gain.connect(ctx.destination);
		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.value = TONE_HZ;
		osc.connect(gain);
		const ramp = 0.01;
		let t = ctx.currentTime + 0.02;
		pattern.forEach((ms, i) => {
			const s = ms / 1000;
			if (i % 2 === 0) {
				gain.gain.setValueAtTime(0, t);
				gain.gain.linearRampToValueAtTime(TONE_GAIN, t + ramp);
				gain.gain.setValueAtTime(TONE_GAIN, t + s - ramp);
				gain.gain.linearRampToValueAtTime(0, t + s);
			}
			t += s;
		});
		osc.start();
		osc.stop(t + 0.05);
		osc.onended = () => void ctx.close().catch(() => undefined);
		void ctx.resume().catch(() => undefined);
	} catch {
		// A tone is a fallback; nothing more to fall back to.
	}
}
