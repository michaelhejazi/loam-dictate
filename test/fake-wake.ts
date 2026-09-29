// A fake Screen Wake Lock and a document whose visibility the test flips.
// Hiding the page drops every lock, as the platform does. "Held" in the tests
// means exactly one lock was granted and not released.
import type { WakeEnv } from "../src/wakelock";

class FakeSentinel extends EventTarget {
	released = false;
	readonly type = "screen";
	onrelease = null;
	async release(): Promise<void> {
		if (this.released) return;
		this.released = true;
		this.dispatchEvent(new Event("release"));
	}
}

export function fakeWake(opts: { api?: boolean } = {}) {
	const sentinels: FakeSentinel[] = [];
	const doc = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
	doc.visibilityState = "visible";
	const env: WakeEnv = {
		wakeLock:
			opts.api === false
				? undefined
				: {
						request: async () => {
							const s = new FakeSentinel();
							sentinels.push(s);
							return s as unknown as WakeLockSentinel;
						},
					},
		doc: doc as unknown as WakeEnv["doc"],
	};
	const set = (v: DocumentVisibilityState) => {
		doc.visibilityState = v;
		doc.dispatchEvent(new Event("visibilitychange"));
	};
	return {
		env,
		sentinels,
		requests: () => sentinels.length,
		held: () => sentinels.filter((s) => !s.released).length,
		hide() {
			for (const s of sentinels) void s.release();
			set("hidden");
		},
		show() {
			set("visible");
		},
	};
}
