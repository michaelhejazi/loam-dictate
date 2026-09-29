// A fake microphone: getUserMedia hands out streams whose tracks remember
// being stopped, and a MediaRecorder that produces one blob on stop. "The
// microphone was released" in the tests means every track handed out was stopped.
import type { MediaEnv } from "../src/recorder";

export class FakeTrack {
	stopped = false;
	stop(): void {
		this.stopped = true;
	}
}

export interface FakeMic {
	env: MediaEnv;
	tracks: FakeTrack[];
	recorders: FakeRecorder[];
	/** True when every track ever handed out has been stopped. */
	released(): boolean;
	/** Make the next getUserMedia wait until the returned function is called. */
	holdPermission(): () => void;
	/** Make the next getUserMedia fail with this DOMException name. */
	denyNext(name: string): void;
}

export class FakeRecorder {
	static supported = new Set<string>(["audio/webm;codecs=opus"]);
	static isTypeSupported(t: string): boolean {
		return FakeRecorder.supported.has(t);
	}
	state: "inactive" | "recording" = "inactive";
	mimeType: string;
	ondataavailable: ((ev: { data: Blob }) => void) | null = null;
	onstop: ((ev: Event) => void) | null = null;
	onerror: ((ev: Event) => void) | null = null;
	constructor(
		readonly stream: unknown,
		readonly options: MediaRecorderOptions,
	) {
		this.mimeType = options.mimeType ?? "audio/mp4";
	}
	start(): void {
		this.state = "recording";
	}
	stop(): void {
		if (this.state === "inactive") return;
		this.state = "inactive";
		queueMicrotask(() => {
			this.ondataavailable?.({ data: new Blob([new Uint8Array([7, 7, 7])], { type: this.mimeType }) });
			this.onstop?.(new Event("stop"));
		});
	}
	fail(): void {
		this.onerror?.(new Event("error"));
	}
}

export function fakeMic(opts: { mediaRecorder?: boolean; getUserMedia?: boolean } = {}): FakeMic {
	const tracks: FakeTrack[] = [];
	const recorders: FakeRecorder[] = [];
	let hold: Promise<void> | null = null;
	let deny: string | null = null;

	const getUserMedia = async () => {
		if (deny) {
			const name = deny;
			deny = null;
			throw Object.assign(new Error(name), { name });
		}
		if (hold) {
			const h = hold;
			hold = null;
			await h;
		}
		const track = new FakeTrack();
		tracks.push(track);
		return { getTracks: () => [track] } as unknown as MediaStream;
	};

	class Recording extends FakeRecorder {
		constructor(stream: unknown, options: MediaRecorderOptions) {
			super(stream, options);
			recorders.push(this);
		}
	}

	return {
		env: {
			mediaDevices: opts.getUserMedia === false ? undefined : { getUserMedia },
			MediaRecorder: opts.mediaRecorder === false ? undefined : (Recording as unknown as typeof MediaRecorder),
		},
		tracks,
		recorders,
		released: () => tracks.every((t) => t.stopped),
		holdPermission() {
			let release!: () => void;
			hold = new Promise<void>((r) => (release = r));
			return release;
		},
		denyNext(name) {
			deny = name;
		},
	};
}
