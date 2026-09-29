// The sheet: an Obsidian Modal, which is a bottom sheet on a phone. It draws
// the session's phase (design/dictate-sheet.html has all six) and forwards
// the buttons. Words land only on Insert; any other way out throws the take away.

import { App, Editor, MarkdownFileInfo, MarkdownView, Modal, Notice, TFile } from "obsidian";
import { insertAtCursor } from "./insert";
import { DictationSession, Phase, SessionDeps } from "./session";

export interface Target {
	editor: Editor;
	ctx: MarkdownFileInfo;
	file: TFile;
}

const BARS = 46;

export class DictateModal extends Modal {
	private readonly session: DictationSession;
	private readonly capMs: number;
	private shownKind: string | null = null;
	private shownWarning = false;
	private clockEl: HTMLElement | null = null;
	private hintEl: HTMLElement | null = null;
	private canvas: HTMLCanvasElement | null = null;
	private levels: number[] = new Array<number>(BARS).fill(0);
	private frame = 0;
	private lastSample = 0;

	constructor(
		app: App,
		private readonly target: Target,
		deps: SessionDeps,
		private readonly termCount: number,
		private readonly onGone: (m: DictateModal) => void,
	) {
		super(app);
		this.session = new DictationSession(deps);
		this.capMs = deps.capMs;
	}

	onOpen(): void {
		this.modalEl.addClass("loam-dictate-modal");
		this.session.onChange((p) => this.render(p));
		this.render(this.session.phase);
		void this.session.record();
	}

	onClose(): void {
		this.session.close();
		this.stopWave();
		this.contentEl.empty();
		this.onGone(this);
	}

	/** Called when the user leaves the note: the take is thrown away, as in the app. */
	leftTarget(): void {
		this.close();
	}

	get file(): TFile {
		return this.target.file;
	}

	private render(p: Phase): void {
		if (p.kind === "closed") return;
		const warning = p.kind === "recording" && p.warning;
		if (p.kind === this.shownKind && warning === this.shownWarning && p.kind === "recording") {
			this.updateRecording(p);
			return;
		}
		this.shownKind = p.kind;
		this.shownWarning = warning;
		this.stopWave();
		this.clockEl = this.hintEl = null;
		this.canvas = null;

		const el = this.contentEl;
		el.empty();
		el.addClass("loam-dictate");
		switch (p.kind) {
			case "unsupported":
				this.head(el, "quiet", "Can't record");
				el.createDiv({ cls: "loam-dictate-err", text: p.message });
				this.actions(el, [["Close", "quiet", () => this.close()]]);
				break;
			case "starting":
				this.head(el, "quiet", "Waiting for the microphone…");
				this.clock(el, "0:00", this.cap(), false);
				this.wave(el, false);
				this.hint(el, "Allow the microphone if Obsidian asks.", false);
				this.actions(el, [["Cancel", "quiet", () => this.close()]]);
				break;
			case "recording":
				this.head(el, p.warning ? "amber" : "", "Recording");
				this.clock(el, fmt(p.elapsedMs), this.cap(), p.warning);
				this.wave(el, false);
				this.hint(el, "", p.warning);
				this.actions(el, [
					["Cancel", "quiet", () => this.close()],
					["Stop", "primary", () => void this.session.stop()],
				]);
				this.updateRecording(p);
				this.startWave();
				break;
			case "cleaning":
				this.head(el, "quiet", "Cleaning up…", true);
				this.clock(el, fmt(p.durationMs), null, false).addClass("is-faint");
				this.wave(el, true);
				this.hint(el, `Record and clean · biased with ${this.session.termsSent} ${plural(this.session.termsSent, "term")}`, false);
				this.actions(el, [["Cancel", "quiet", () => this.close()]]);
				this.drawWave(true);
				break;
			case "ready": {
				this.head(el, "quiet", "Ready");
				el.createDiv({ cls: "loam-dictate-text", text: p.text });
				const meta = el.createDiv({ cls: "loam-dictate-meta" });
				meta.createSpan({ text: `${words(p.text)} ${plural(words(p.text), "word")} · ${fmt(p.durationMs)}` });
				if (!p.targetGone) {
					const retake = meta.createEl("a", { cls: "loam-dictate-link", text: "Retake", href: "#" });
					retake.addEventListener("click", (ev) => {
						ev.preventDefault();
						void this.session.retake();
					});
					this.actions(el, [
						["Discard", "quiet", () => this.close()],
						["Insert", "primary", () => this.insert(p.text)],
					]);
				} else {
					el.createDiv({ cls: "loam-dictate-err", text: `${this.target.file.basename} is no longer open for editing, so the words weren't inserted anywhere else. Copy them, or discard them.` });
					this.actions(el, [
						["Discard", "quiet", () => this.close()],
						["Copy", "primary", () => void this.copy(p.text)],
					]);
				}
				break;
			}
			case "failed": {
				this.head(el, "quiet", "Not cleaned");
				this.clock(el, fmt(p.durationMs), null, false).addClass("is-faint");
				const err = el.createDiv({ cls: "loam-dictate-err", text: p.message });
				err.createEl("small", {
					text: p.takeKept ? "Try again when you have signal, or discard it." : "Try again to record, or close.",
				});
				this.actions(el, [
					["Discard", "quiet danger", () => this.close()],
					["Try again", "primary", () => void this.session.retry()],
				]);
				break;
			}
		}
	}

	private head(el: HTMLElement, dot: string, label: string, spinning = false): void {
		const head = el.createDiv({ cls: "loam-dictate-head" });
		const state = head.createDiv({ cls: "loam-dictate-state" });
		if (spinning) state.createSpan({ cls: "loam-dictate-spin" });
		else state.createSpan({ cls: ["loam-dictate-dot", ...(dot ? [`is-${dot}`] : [])] });
		state.createSpan({ text: label });
		const into = head.createDiv({ cls: "loam-dictate-into", text: "into " });
		into.createEl("b", { text: this.target.file.basename });
	}

	private clock(el: HTMLElement, now: string, cap: string | null, amber: boolean): HTMLElement {
		const clock = el.createDiv({ cls: ["loam-dictate-clock", ...(amber ? ["is-amber"] : [])] });
		this.clockEl = clock.createSpan({ cls: "loam-dictate-big", text: now });
		if (cap) clock.createSpan({ cls: "loam-dictate-cap", text: `/ ${cap}` });
		return clock;
	}

	private hint(el: HTMLElement, text: string, amber: boolean): void {
		this.hintEl = el.createDiv({ cls: ["loam-dictate-hint", ...(amber ? ["is-amber"] : [])], text });
	}

	private actions(el: HTMLElement, buttons: Array<[string, string, () => void]>): void {
		const row = el.createDiv({ cls: "loam-dictate-actions" });
		for (const [text, kind, fn] of buttons) {
			const cls = ["loam-dictate-btn", ...kind.split(" ").map((k) => `is-${k}`)];
			if (kind.includes("primary")) cls.push("mod-cta");
			const b = row.createEl("button", { text, cls });
			b.addEventListener("click", fn);
		}
	}

	private updateRecording(p: Extract<Phase, { kind: "recording" }>): void {
		this.clockEl?.setText(fmt(p.elapsedMs));
		if (!this.hintEl) return;
		if (p.warning) {
			const left = Math.max(0, Math.ceil((this.capMs - p.elapsedMs) / 1000));
			this.hintEl.setText(`${left} ${plural(left, "second")} left`);
		} else {
			this.hintEl.setText(`Names and terms: ${this.termCount} · Tap Stop when you're done`);
		}
	}

	private cap(): string {
		return fmt(this.capMs);
	}

	// The wave: a canvas of recent loudness, so nothing is styled inline.

	private wave(el: HTMLElement, frozen: boolean): void {
		this.canvas = el.createEl("canvas", { cls: ["loam-dictate-wave", ...(frozen ? ["is-frozen"] : [])] });
	}

	private startWave(): void {
		const step = (t: number) => {
			if (t - this.lastSample > 90) {
				this.lastSample = t;
				this.levels.push(this.session.level());
				this.levels.shift();
			}
			this.drawWave(false);
			this.frame = window.requestAnimationFrame(step);
		};
		this.frame = window.requestAnimationFrame(step);
	}

	private stopWave(): void {
		if (this.frame) window.cancelAnimationFrame(this.frame);
		this.frame = 0;
	}

	private drawWave(frozen: boolean): void {
		const canvas = this.canvas;
		if (!canvas) return;
		const ratio = window.devicePixelRatio || 1;
		const w = canvas.clientWidth, h = canvas.clientHeight;
		if (!w || !h) return;
		if (canvas.width !== Math.round(w * ratio)) canvas.width = Math.round(w * ratio);
		if (canvas.height !== Math.round(h * ratio)) canvas.height = Math.round(h * ratio);
		const g = canvas.getContext("2d");
		if (!g) return;
		g.setTransform(ratio, 0, 0, ratio, 0, 0);
		g.clearRect(0, 0, w, h);
		g.fillStyle = getComputedStyle(canvas).color;
		const bar = 3, gap = 3, total = BARS * bar + (BARS - 1) * gap;
		const x0 = Math.max(0, (w - total) / 2);
		this.levels.forEach((v, i) => {
			const bh = Math.max(4, Math.min(h, (frozen ? 0.15 + 0.5 * v : 0.08 + v) * h));
			g.fillRect(x0 + i * (bar + gap), (h - bh) / 2, bar, bh);
		});
	}

	// Insert, or Copy when the editor is gone.

	private insert(text: string): void {
		if (!this.targetAlive()) {
			this.session.targetGone();
			return;
		}
		insertAtCursor(this.target.editor, text);
		// The cursor now sits after the words; don't let the modal put it back.
		this.shouldRestoreSelection = false;
		this.close();
	}

	private targetAlive(): boolean {
		const { ctx, editor, file } = this.target;
		if (ctx.file !== file || ctx.editor !== editor) return false;
		if (ctx instanceof MarkdownView) return ctx.getMode() === "source" && ctx.containerEl.isConnected;
		return true;
	}

	private async copy(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			new Notice("Loam Dictate: copied the words.");
			this.close();
		} catch {
			new Notice("Loam Dictate: couldn't copy. Select the text in the sheet and copy it by hand.");
		}
	}
}

function fmt(ms: number): string {
	const s = Math.floor(ms / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function words(text: string): number {
	const t = text.trim();
	return t ? t.split(/\s+/).length : 0;
}

function plural(n: number, word: string): string {
	return n === 1 ? word : word + "s";
}
