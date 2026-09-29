// Keeps the screen on while a take records, through the Screen Wake Lock API.
// The platform drops the lock whenever the page is hidden, so while it is
// still wanted it is asked for again each time the page is shown. Where the
// API is missing this does nothing.

export interface WakeEnv {
	wakeLock?: { request(type: "screen"): Promise<WakeLockSentinel> };
	doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
}

export function browserWakeEnv(): WakeEnv {
	const nav = navigator as Navigator & { wakeLock?: WakeLock };
	return { wakeLock: nav.wakeLock, doc: document };
}

export class ScreenWake {
	private wanted = false;
	private sentinel: WakeLockSentinel | null = null;
	private asking = false;

	constructor(private readonly env: WakeEnv) {}

	get supported(): boolean {
		return !!this.env.wakeLock;
	}

	/** Keep the screen on until release(). Safe to call again while held. */
	hold(): void {
		if (this.wanted || !this.env.wakeLock) return;
		this.wanted = true;
		this.env.doc.addEventListener("visibilitychange", this.onVisibility);
		void this.acquire();
	}

	/** Let the screen sleep again. Safe to call any time, more than once. */
	release(): void {
		if (!this.wanted) return;
		this.wanted = false;
		this.env.doc.removeEventListener("visibilitychange", this.onVisibility);
		const s = this.sentinel;
		this.sentinel = null;
		if (s && !s.released) void s.release().catch(() => undefined);
	}

	private readonly onVisibility = (): void => {
		if (this.env.doc.visibilityState === "visible") void this.acquire();
	};

	private async acquire(): Promise<void> {
		const wl = this.env.wakeLock;
		if (!wl || !this.wanted || this.asking || (this.sentinel && !this.sentinel.released)) return;
		if (this.env.doc.visibilityState !== "visible") return;
		this.asking = true;
		let s: WakeLockSentinel;
		try {
			s = await wl.request("screen");
		} catch {
			// Refused (low battery, policy): the take goes on with the screen as it is.
			return;
		} finally {
			this.asking = false;
		}
		if (!this.wanted) {
			void s.release().catch(() => undefined);
			return;
		}
		this.sentinel = s;
	}
}
