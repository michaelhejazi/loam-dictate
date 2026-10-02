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
	{ kind: "polishing", durationMs: 12_000, level: "light" },
	{ kind: "ready", text: "Words.", biased: true, durationMs: 12_000, targetGone: false, polish: { text: "Words.", level: "light", ran: true } },
	{ kind: "ready", text: "Words.", biased: true, durationMs: 12_000, targetGone: true, polish: { text: "Words.", level: "light", ran: true } },
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
			expect(head.cls).toEqual(["spoken-head"]);
			const into = head.children[head.children.length - 1];
			expect(into.cls).toEqual(["spoken-into", "spoken-beside-close"]);
			expect(into.text + into.children.map((c) => c.text).join("")).toBe("into A very long note name that would run under the close button");
		},
	);

	it("styles.css gives that class its room against Obsidian's modal, without touching the close button", () => {
		const css = readFileSync("styles.css", "utf8");
		const rule = /\.modal\.spoken-modal \.spoken-into\.spoken-beside-close \{([^}]*)\}/.exec(css);
		expect(rule?.[1]).toMatch(/margin-inline-end: var\(--size-4-12, 48px\);/);
		expect(css).not.toMatch(/modal-close-button|modal-header-button/);
	});
});

/** Every text under an element, in order. */
const texts = (e: El): string[] => [e.text, ...e.children.flatMap(texts)].filter(Boolean);
const find = (e: El, cls: string): El | undefined => (e.cls.includes(cls) ? e : e.children.map((c) => find(c, cls)).find(Boolean));

describe("Polish on the sheet", () => {
	const ready = (polish: Extract<Phase, { kind: "ready" }>["polish"], text = "Tell Flio hello."): Phase => ({
		kind: "ready",
		text,
		biased: true,
		durationMs: 42_000,
		targetGone: false,
		polish,
	});

	it("Polishing: a spinner, the level in the hint, Cancel and Skip", () => {
		const sheet = draw({ kind: "polishing", durationMs: 42_000, level: "full" });
		expect(texts(sheet.children[0])).toContain("Polishing…");
		expect(find(sheet, "spoken-spin")).toBeDefined();
		expect(find(sheet, "spoken-hint")!.text).toBe("Full polish · names from the terms note");
		expect(texts(find(sheet, "spoken-actions")!)).toEqual(["Cancel", "Skip"]);
	});

	it("Ready after Light: the meta line says Light polish and offers Off and Full, then Retake", () => {
		const meta = find(draw(ready({ text: "Tell Flio hello.", level: "light", ran: true })), "spoken-meta")!;
		expect(meta.children[0].text).toBe("3 words · 0:42 · Light polish");
		expect(texts(find(meta, "spoken-links")!)).toEqual(["Off", "Full", "Retake"]);
	});

	it("Ready with polish off: offers Light and Full", () => {
		const meta = find(draw(ready({ text: "tell fleo hello", level: "off", ran: true }, "tell fleo hello")), "spoken-meta")!;
		expect(meta.children[0].text).toBe("3 words · 0:42 · Polish off");
		expect(texts(find(meta, "spoken-links")!)).toEqual(["Light", "Full", "Retake"]);
	});

	it("Ready after a fallback: Not polished, a quiet line saying why, and Light and Full to try again", () => {
		const sheet = draw(ready({ text: "tell fleo hello", level: "light", ran: false, why: "Gemini took too long" }, "tell fleo hello"));
		const meta = find(sheet, "spoken-meta")!;
		expect(meta.children[0].text).toBe("3 words · 0:42 · Not polished");
		expect(texts(find(meta, "spoken-links")!)).toEqual(["Light", "Full", "Retake"]);
		expect(find(sheet, "spoken-polish-note")!.text).toBe("Polish did not run: Gemini took too long. This is the transcript as heard.");
		expect(find(sheet, "spoken-err")).toBeUndefined();
		expect(texts(find(sheet, "spoken-actions")!)).toEqual(["Discard", "Insert"]);
	});

	it("the design file draws the Polishing state", () => {
		const html = readFileSync("design/dictate-sheet.html", "utf8");
		expect(html).toMatch(/Polishing…/);
		expect(html).toMatch(/Light polish/);
	});
});
