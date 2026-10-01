import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Phase, SessionDeps } from "../src/session";

// The sheet's header over a stand-in for Obsidian's Modal and its DOM helpers
// (createDiv, createSpan, createEl, addClass, setText, empty). How it looks
// next to Obsidian's close button is a device's to prove; this holds the
// markup to the class that makes the room.
interface El {
	tag: string;
	cls: string[];
	text: string;
	children: El[];
}
function el(tag: string, o: { cls?: string | string[]; text?: string } = {}): El & Record<string, unknown> {
	const e = {
		tag,
		cls: o.cls === undefined ? [] : Array.isArray(o.cls) ? [...o.cls] : [o.cls],
		text: o.text ?? "",
		children: [] as El[],
		createEl(t: string, oo?: { cls?: string | string[]; text?: string }) {
			const c = el(t, oo);
			e.children.push(c);
			return c;
		},
		createDiv(oo?: { cls?: string | string[]; text?: string }) {
			return e.createEl("div", oo);
		},
		createSpan(oo?: { cls?: string | string[]; text?: string }) {
			return e.createEl("span", oo);
		},
		addClass(c: string) {
			e.cls.push(c);
		},
		setText(t: string) {
			e.text = t;
		},
		empty() {
			e.children.length = 0;
		},
		addEventListener() {},
		getContext: () => null,
	};
	return e;
}
vi.mock("obsidian", () => {
	class Modal {
		modalEl = el("div", { cls: "modal" });
		contentEl = el("div", { cls: "modal-content" });
		constructor(public app: unknown) {}
		close() {}
	}
	class Stub {}
	return { Modal, MarkdownView: Stub, Notice: Stub, TFile: Stub };
});

const { DictateModal } = await import("../src/modal");

const PHASES: Phase[] = [
	{ kind: "unsupported", message: "No microphone." },
	{ kind: "starting" },
	{ kind: "recording", elapsedMs: 12_000, warning: false },
	{ kind: "recording", elapsedMs: 95_000, warning: true },
	{ kind: "cleaning", durationMs: 12_000, terms: 3 },
	{ kind: "ready", text: "Words.", biased: true, durationMs: 12_000, targetGone: false },
	{ kind: "ready", text: "Words.", biased: true, durationMs: 12_000, targetGone: true },
	{ kind: "failed", message: "No signal.", durationMs: 12_000, takeKept: true },
];

function draw(p: Phase): El {
	const target = { editor: {}, ctx: {}, file: { basename: "A very long note name that would run under the close button" } };
	const modal = new DictateModal({} as never, target as never, { capMs: 120_000 } as SessionDeps, 3, () => {});
	(modal as unknown as { render(p: Phase): void }).render(p);
	return (modal as unknown as { contentEl: El }).contentEl;
}

describe("the sheet's header", () => {
	// The recording sheet starts its wave; under Node no frame ever comes.
	const w = window as unknown as Record<string, unknown>;
	const saved = { raf: w.requestAnimationFrame, caf: w.cancelAnimationFrame };
	beforeAll(() => {
		w.requestAnimationFrame = () => 1;
		w.cancelAnimationFrame = () => {};
	});
	afterAll(() => {
		w.requestAnimationFrame = saved.raf;
		w.cancelAnimationFrame = saved.caf;
	});

	it.each(PHASES.map((p) => [p.kind + ("warning" in p && p.warning ? " (warning)" : "") + ("targetGone" in p && p.targetGone ? " (note gone)" : ""), p]))(
		"%s: the note name is the right-hand element and reserves room for the close button",
		(_, p) => {
			const head = draw(p as Phase).children[0];
			expect(head.cls).toEqual(["loam-dictate-head"]);
			const into = head.children[head.children.length - 1];
			expect(into.cls).toEqual(["loam-dictate-into", "loam-dictate-beside-close"]);
			expect(into.text + into.children.map((c) => c.text).join("")).toBe("into A very long note name that would run under the close button");
		},
	);

	it("styles.css gives that class its room against Obsidian's modal, without touching the close button", () => {
		const css = readFileSync("styles.css", "utf8");
		const rule = /\.modal\.loam-dictate-modal \.loam-dictate-into\.loam-dictate-beside-close \{([^}]*)\}/.exec(css);
		expect(rule?.[1]).toMatch(/margin-inline-end: var\(--size-4-12, 48px\);/);
		expect(css).not.toMatch(/modal-close-button|modal-header-button/);
	});
});
