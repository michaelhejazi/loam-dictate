import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The settings tab against a stand-in for Obsidian's declarative settings
// (1.13): draw() walks getSettingDefinitions() the way Obsidian renders it,
// skipping what is not visible, handing `render` rows a stand-in Setting and
// recording `control` rows with their value from getControlValue(). Each row
// keeps its name and controls, so the test sees what the tab draws.
const drawn: Row[] = [];
interface Row {
	name: string;
	desc: string;
	controls: Control[];
	controlEl: El;
	descEl: El;
}
interface Control {
	kind: string;
	key?: string;
	inputType?: string;
	value?: string;
	options?: string[];
	onChange?: (v: string) => unknown;
	onClick?: () => unknown;
}
/** Elements the tab creates inside a row, with their text, attributes and children. */
interface El {
	tag: string;
	cls: string;
	text: string;
	href?: string;
	attrs: Record<string, string>;
	children: El[];
	createEl(tag: string, o?: { text?: string; cls?: string; href?: string }): El;
	appendText(t: string): void;
	setText(t: string): void;
	setAttr(k: string, v: string): void;
}
function el(tag: string, o: { text?: string; cls?: string; href?: string } = {}): El {
	const e: El = {
		tag,
		cls: o.cls ?? "",
		text: o.text ?? "",
		href: o.href,
		attrs: {},
		children: [],
		createEl(t, oo) {
			const c = el(t, oo);
			e.children.push(c);
			return c;
		},
		appendText(t) {
			e.children.push(el("#text", { text: t }));
		},
		setText(t) {
			e.text = t;
		},
		setAttr(k, v) {
			e.attrs[k] = v;
		},
	};
	return e;
}
/** An element's whole text, its children's included. */
const textOf = (e: El): string => e.text + e.children.map(textOf).join("");
const links = (e: El): El[] => [...(e.tag === "a" ? [e] : []), ...e.children.flatMap(links)];
/** Every element under a row's description, depth first. */
const under = (e: El): El[] => e.children.flatMap((c) => [c, ...under(c)]);
vi.mock("obsidian", () => {
	const component = (c: Control) => {
		const self: Record<string, unknown> = {
			inputEl: {
				set type(t: string) {
					c.inputType = t;
				},
				autocomplete: "",
			},
		};
		const chain = (fn?: (...a: never[]) => void) => (...a: never[]) => (fn?.(...a), self);
		Object.assign(self, {
			setPlaceholder: chain(),
			setValue: chain((v: string) => (c.value = String(v))),
			onChange: chain((fn: (v: string) => unknown) => (c.onChange = fn)),
			setButtonText: chain((t: string) => (c.value = t)),
			onClick: chain((fn: () => unknown) => (c.onClick = fn)),
		});
		return self;
	};
	class Setting {
		row: Row = { name: "", desc: "", controls: [], controlEl: el("div"), descEl: el("div") };
		controlEl = this.row.controlEl;
		descEl = this.row.descEl;
		setName(n: string) {
			this.row.name = n;
			return this;
		}
		setDesc(d: string) {
			this.row.desc = d;
			this.descEl.children.splice(0);
			return this;
		}
		private add(kind: string, cb: (c: never) => void) {
			const c: Control = { kind };
			this.row.controls.push(c);
			cb(component(c) as never);
			return this;
		}
		addText(cb: (c: never) => void) {
			return this.add("text", cb);
		}
		addButton(cb: (c: never) => void) {
			return this.add("button", cb);
		}
	}
	class PluginSettingTab {
		refreshes = 0;
		refreshDomState() {
			this.refreshes++;
		}
	}
	return { Setting, PluginSettingTab };
});

const { Setting } = await import("obsidian");
const { LoamDictateSettingTab, upgradeSettings, DEFAULT_SETTINGS, PROVIDER_FIELDS, KEY_STEPS, KEY_PRICING, AI_STUDIO_KEYS_URL, GEMINI_PRICING_URL } =
	await import("../src/settings");
const { makeTranscriber, visibleProviders } = await import("../src/provider");
const { GeminiTranscriber } = await import("../src/gemini");
const { LoamTranscriber } = await import("../src/loam");
type Settings = import("../src/settings").LoamDictateSettings;
type Tab = InstanceType<typeof LoamDictateSettingTab>;
type Def = import("obsidian").SettingDefinitionItem;

const shown = (v: boolean | (() => boolean) | undefined) => (typeof v === "function" ? v() : v !== false);

/** Draws the tab as Obsidian 1.13 would: visible rows only, in order. */
function draw(t: Tab): void {
	drawn.splice(0);
	const walk = (defs: Def[]) => {
		for (const d of defs) {
			if ("type" in d) {
				if (shown(d.visible) && d.items) walk(d.items as Def[]);
				continue;
			}
			if (!shown(d.visible)) continue;
			if ("render" in d && d.render) {
				const setting = new Setting({} as never) as unknown as { row: Row };
				drawn.push(setting.row);
				d.render(setting as never, {} as never);
			} else {
				const row: Row = { name: d.name, desc: String(d.desc ?? ""), controls: [], controlEl: el("div"), descEl: el("div") };
				if ("control" in d && d.control) {
					const c = d.control;
					row.controls.push({
						kind: c.type,
						key: c.key,
						value: String(t.getControlValue(c.key) ?? c.defaultValue ?? ""),
						options: c.type === "dropdown" ? Object.keys(c.options) : undefined,
						onChange: (v) => t.setControlValue(c.key, v),
					});
				}
				drawn.push(row);
			}
		}
	};
	walk(t.getSettingDefinitions());
}

function tab(settings: Settings) {
	const plugin = {
		settings,
		saveSettings: vi.fn(async () => {}),
		signals: { path: () => "vibration" as const },
		openTermsNote: vi.fn(async () => {}),
		appendOldTerms: vi.fn(async () => {}),
		checkGeminiKey: vi.fn(async () => ({ outcome: "refused", sentence: "Google refused this key." })),
		reportUrl: vi.fn(() => "https://github.com/michaelhejazi/loam-dictate/issues/new?body=x"),
	};
	const t = new LoamDictateSettingTab({} as never, plugin as never);
	draw(t);
	return { t, plugin, refreshes: () => (t as unknown as { refreshes: number }).refreshes };
}
const names = () => drawn.map((r) => r.name);
const row = (name: string) => drawn.find((r) => r.name === name)!;

describe("migrating settings from 0.1.x", () => {
	it("an install with a Loam address and token comes up on the Loam provider, saved, with everything kept", () => {
		const old = { server: "https://loam.example.net", token: "fake-token-not-a-secret", maxMinutes: 7, terms: "Simin\nFlyo" };
		const { settings, changed } = upgradeSettings(old);
		expect(changed).toBe(true);
		expect(settings).toEqual({
			provider: "loam",
			geminiKey: "",
			geminiModel: "gemini-3.5-transcribe",
			server: "https://loam.example.net",
			token: "fake-token-not-a-secret",
			maxMinutes: 7,
			termsPath: "Dictation terms.md",
			terms: "Simin\nFlyo",
		});
	});

	it("a fresh install defaults to Gemini", () => {
		expect(upgradeSettings(null)).toEqual({ settings: DEFAULT_SETTINGS, changed: false });
		expect(upgradeSettings({}).settings.provider).toBe("gemini");
		expect(upgradeSettings({ server: "", token: "", maxMinutes: 5 }).settings.provider).toBe("gemini");
	});

	it("a saved provider is kept whatever else is set", () => {
		expect(upgradeSettings({ provider: "gemini", server: "https://loam.example.net", token: "t" }).settings.provider).toBe("gemini");
		expect(upgradeSettings({ provider: "loam" })).toMatchObject({ settings: { provider: "loam" }, changed: false });
	});
});

describe("which providers are offered", () => {
	it("a fresh install sees only Gemini: no Transcribe with, no Loam anywhere", () => {
		const settings = upgradeSettings(null).settings;
		expect(visibleProviders(settings)).toEqual(["gemini"]);
		tab(settings);
		expect(names()).not.toContain("Transcribe with");
		for (const f of PROVIDER_FIELDS.loam) expect(names()).not.toContain(f);
		expect(drawn.some((r) => /Loam UI|Loam server/.test(r.desc))).toBe(false);
		expect(drawn.some((r) => under(r.descEl).some((e) => /Loam UI|Loam server/.test(textOf(e))))).toBe(false);
	});

	it("an install with a Loam address and token saved keeps Loam in the dropdown, on either provider", () => {
		const saved = { provider: "loam", server: "https://loam.example.net", token: "fake-token-not-a-secret", geminiKey: "fake-gemini-key-not-a-secret" };
		const { settings } = upgradeSettings(saved);
		expect(visibleProviders(settings)).toEqual(["gemini", "loam"]);
		tab(settings);
		expect(row("Transcribe with").controls[0]).toMatchObject({ value: "loam", options: ["gemini", "loam"] });
		tab({ ...settings, provider: "gemini" });
		expect(row("Transcribe with").controls[0]).toMatchObject({ value: "gemini", options: ["gemini", "loam"] });
	});

	it("either a saved address or a saved token alone is enough, and so is Loam being chosen", () => {
		expect(visibleProviders({ ...DEFAULT_SETTINGS, server: "https://loam.example.net" })).toEqual(["gemini", "loam"]);
		expect(visibleProviders({ ...DEFAULT_SETTINGS, token: "fake-token-not-a-secret" })).toEqual(["gemini", "loam"]);
		expect(visibleProviders({ ...DEFAULT_SETTINGS, provider: "loam" })).toEqual(["gemini", "loam"]);
		expect(visibleProviders({ ...DEFAULT_SETTINGS, server: "  ", token: "" })).toEqual(["gemini"]);
	});
});

describe("getting to a working key", () => {
	it("Check key sits beside the key field and reports in place under it", async () => {
		const { plugin } = tab({ ...DEFAULT_SETTINGS, geminiKey: "fake-gemini-key-not-a-secret" });
		const key = row("Gemini API key");
		expect(key.controls.map((c) => [c.kind, c.value])).toEqual([
			["text", "fake-gemini-key-not-a-secret"],
			["button", "Check key"],
		]);
		const result = under(key.descEl).find((e) => e.cls.includes("loam-dictate-keycheck"))!;
		expect(result.text).toBe("");
		await key.controls[1].onClick!();
		expect(plugin.checkGeminiKey).toHaveBeenCalledTimes(1);
		expect(result.text).toBe("Google refused this key.");
		expect(result.attrs["data-outcome"]).toBe("refused");
	});

	it("the key's steps fold under the key field, with AI Studio and the pricing page linked, and no prices", () => {
		tab({ ...DEFAULT_SETTINGS });
		const { descEl } = row("Gemini API key");
		const help = descEl.children.find((e) => e.tag === "details")!;
		expect(descEl.children.indexOf(help)).toBe(descEl.children.findIndex((e) => e.cls.includes("loam-dictate-keycheck")) + 1);
		expect(help.children[0]).toMatchObject({ tag: "summary", text: "How to get a Gemini API key" });
		expect(help.children[1].children).toHaveLength(KEY_STEPS.length);
		expect(links(help).map((a) => a.href)).toEqual([AI_STUDIO_KEYS_URL, GEMINI_PRICING_URL]);
		expect(textOf(help)).not.toMatch(/[$€£]\s?\d/);
	});

	it("the README gives the same steps, word for word", () => {
		const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8").replace(/\s+/g, " ");
		const plain = (parts: (string | { text: string; href: string })[]) =>
			parts.map((p) => (typeof p === "string" ? p : `[${p.text}](${p.href})`)).join("");
		for (const step of KEY_STEPS) expect(readme).toContain(plain(step));
		expect(readme).toContain(plain(KEY_PRICING));
	});
});

describe("Report a problem", () => {
	it("is a link in the settings tab to the plugin's pre-filled issue", () => {
		const { plugin } = tab({ ...DEFAULT_SETTINGS });
		const report = row("Report a problem");
		expect(report.desc).toMatch(/Never your key, a server address or a recording/);
		expect(links(report.controlEl).map((a) => [a.text, a.href])).toEqual([["Open an issue", plugin.reportUrl()]]);
	});
});

describe("the provider switch", () => {
	it("Gemini shows the key as a password field and the model with its default, and no Loam fields", () => {
		tab({ ...DEFAULT_SETTINGS });
		expect(names()).toEqual(expect.arrayContaining(PROVIDER_FIELDS.gemini));
		for (const f of PROVIDER_FIELDS.loam) expect(names()).not.toContain(f);
		expect(row("Gemini API key").controls[0].inputType).toBe("password");
		expect(row("Model").controls[0].value).toBe("gemini-3.5-transcribe");
		expect(row("Model").desc).toMatch(/speech-to-text/);
	});

	it("Loam shows the address and the token as now, and no Gemini fields", () => {
		tab({ ...DEFAULT_SETTINGS, provider: "loam", server: "https://loam.example.net" });
		expect(names()).toEqual(expect.arrayContaining(PROVIDER_FIELDS.loam));
		for (const f of PROVIDER_FIELDS.gemini) expect(names()).not.toContain(f);
		expect(row("Server address").controls[0].value).toBe("https://loam.example.net");
		expect(row("Token").controls[0].inputType).toBe("password");
	});

	it("switching the dropdown saves the provider and redraws with the other fields", async () => {
		const settings = { ...DEFAULT_SETTINGS, server: "https://loam.example.net" };
		const { t, plugin, refreshes } = tab(settings);
		await row("Transcribe with").controls[0].onChange!("loam");
		expect(settings.provider).toBe("loam");
		expect(plugin.saveSettings).toHaveBeenCalled();
		// Obsidian re-evaluates every row's visible() on refreshDomState; draw() does the same here.
		expect(refreshes()).toBe(1);
		draw(t);
		expect(names()).toContain("Server address");
		expect(names()).not.toContain("Gemini API key");
	});

	it("the terms note is one path setting with an Open button, and no in-settings list", () => {
		const { plugin } = tab({ ...DEFAULT_SETTINGS });
		expect(row("Names and terms note").controls.map((c) => [c.kind, c.value])).toEqual([
			["text", "Dictation terms.md"],
			["button", "Open"],
		]);
		expect(drawn.some((r) => r.controls.some((c) => c.kind === "textarea"))).toBe(false);
		expect(names()).not.toContain("Names and terms from before 0.2");
		expect(plugin.openTermsNote).not.toHaveBeenCalled();
	});

	it("old terms kept because the note existed are shown, with Add to note and Forget", () => {
		tab({ ...DEFAULT_SETTINGS, terms: "Simin\nFlyo\n" });
		const old = row("Names and terms from before 0.2");
		expect(old.desc).toMatch(/^2 terms are still in this plugin's settings and not used/);
		expect(old.controls.map((c) => c.value)).toEqual(["Add to note", "Forget"]);
	});

	it("Forget drops the old terms, saves, and the row goes", async () => {
		const settings: Settings = { ...DEFAULT_SETTINGS, terms: "Simin\n" };
		const { t, plugin, refreshes } = tab(settings);
		await row("Names and terms from before 0.2").controls[1].onClick!();
		expect(settings.terms).toBeUndefined();
		expect(plugin.saveSettings).toHaveBeenCalled();
		expect(refreshes()).toBe(1);
		draw(t);
		expect(names()).not.toContain("Names and terms from before 0.2");
	});

	it("Open opens the terms note", async () => {
		const { plugin } = tab({ ...DEFAULT_SETTINGS });
		await row("Names and terms note").controls[1].onClick!();
		expect(plugin.openTermsNote).toHaveBeenCalledTimes(1);
	});

	it("constructs the class for the provider chosen", () => {
		const http = vi.fn();
		expect(makeTranscriber(() => ({ ...DEFAULT_SETTINGS }), http)).toBeInstanceOf(GeminiTranscriber);
		expect(makeTranscriber(() => ({ ...DEFAULT_SETTINGS, provider: "loam" }), http)).toBeInstanceOf(LoamTranscriber);
	});

	it("the constructed transcriber reads its key at send time, so a new key applies to Try again", async () => {
		const settings = { ...DEFAULT_SETTINGS, geminiKey: "" };
		const http = vi.fn(async () => ({ status: 200, text: '{"status":"completed","steps":[{"type":"model_output","content":[{"type":"text","text":"ok"}]}]}' }));
		const t = makeTranscriber(() => settings, http);
		await expect(t.transcribe(new ArrayBuffer(1), "audio/webm", [])).rejects.toThrow(/API key/);
		settings.geminiKey = "fake-gemini-key-not-a-secret";
		await expect(t.transcribe(new ArrayBuffer(1), "audio/webm", [])).resolves.toEqual({ text: "ok", biased: false });
		expect(http.mock.calls[0]).toBeDefined();
	});
});

describe("settings search (Obsidian 1.13's declarative settings)", () => {
	it("the tab is declared, not drawn: no display() of its own", () => {
		expect(Object.getOwnPropertyNames(LoamDictateSettingTab.prototype)).not.toContain("display");
		expect(Object.getOwnPropertyNames(LoamDictateSettingTab.prototype)).toContain("getSettingDefinitions");
	});

	it("every row the tab can show is a named, searchable definition, whichever provider is chosen", () => {
		const { t } = tab({ ...DEFAULT_SETTINGS, terms: "Simin" });
		const defs = t.getSettingDefinitions();
		const declared = defs.map((d) => ("name" in d ? d.name : ""));
		expect(declared).toEqual([
			"Transcribe with",
			...PROVIDER_FIELDS.gemini,
			...PROVIDER_FIELDS.loam,
			"Dictate from the phone's toolbar",
			"Longest recording",
			"Alerts",
			"Names and terms note",
			"Names and terms from before 0.2",
			"Report a problem",
		]);
		for (const d of defs) expect("searchable" in d && d.searchable === false).toBe(false);
	});

	it("a drawn row's name and description, which search reads from the definition, are the ones it draws", () => {
		for (const settings of [{ ...DEFAULT_SETTINGS, terms: "Simin" }, { ...DEFAULT_SETTINGS, provider: "loam" as const, server: "https://loam.example.net" }]) {
			const { t } = tab(settings);
			const declared = t.getSettingDefinitions().filter((d) => "name" in d && "render" in d && names().includes(d.name));
			expect(declared.length).toBeGreaterThan(0);
			for (const d of declared) if ("name" in d && d.desc !== undefined) expect(row(d.name).desc).toBe(d.desc);
		}
	});

	it("Longest recording is a 1–15 slider holding the saved minutes, and a typed value is clamped", async () => {
		const settings = { ...DEFAULT_SETTINGS, maxMinutes: 7 };
		const { plugin } = tab(settings);
		expect(row("Longest recording").controls[0]).toMatchObject({ kind: "slider", key: "maxMinutes", value: "7" });
		await row("Longest recording").controls[0].onChange!("40");
		expect(settings.maxMinutes).toBe(15);
		expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
	});

	it("what is typed is saved as before: the key and address trimmed, a blank model or note path back to its default", async () => {
		const settings: Settings = { ...DEFAULT_SETTINGS, provider: "loam" };
		const { t } = tab(settings);
		await t.setControlValue("geminiKey", "  fake-gemini-key-not-a-secret ");
		await t.setControlValue("geminiModel", "   ");
		await t.setControlValue("server", " https://loam.example.net ");
		await row("Token").controls[0].onChange!(" fake-token-not-a-secret ");
		await row("Names and terms note").controls[0].onChange!("  ");
		expect(settings).toMatchObject({
			geminiKey: "fake-gemini-key-not-a-secret",
			geminiModel: "gemini-3.5-transcribe",
			server: "https://loam.example.net",
			token: "fake-token-not-a-secret",
			termsPath: "Dictation terms.md",
		});
	});

	it("the Alerts line says how this device will be told, under its own name", () => {
		tab({ ...DEFAULT_SETTINGS });
		expect(row("Alerts").desc).toMatch(/^Vibration: a tap when recording starts/);
		expect(row("Alerts").controls).toEqual([]);
	});
});
