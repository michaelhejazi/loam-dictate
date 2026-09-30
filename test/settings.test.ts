import { describe, expect, it, vi } from "vitest";

// The settings tab against a stand-in for Obsidian's Setting: it records each
// setting's name and controls, so the test sees what the tab draws.
const drawn: Array<{ name: string; desc: string; controls: Control[] }> = [];
interface Control {
	kind: string;
	inputType?: string;
	value?: string;
	onChange?: (v: string) => unknown;
}
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
			addOptions: chain(),
			setLimits: chain(),
			setDynamicTooltip: chain(),
			setButtonText: chain((t: string) => (c.value = t)),
			onClick: chain(),
		});
		return self;
	};
	class Setting {
		private row: { name: string; desc: string; controls: Control[] } = { name: "", desc: "", controls: [] };
		constructor() {
			drawn.push(this.row);
		}
		setName(n: string) {
			this.row.name = n;
			return this;
		}
		setDesc(d: string) {
			this.row.desc = d;
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
		addDropdown(cb: (c: never) => void) {
			return this.add("dropdown", cb);
		}
		addSlider(cb: (c: never) => void) {
			return this.add("slider", cb);
		}
		addButton(cb: (c: never) => void) {
			return this.add("button", cb);
		}
	}
	class PluginSettingTab {
		containerEl = {
			empty: () => void drawn.splice(0),
			createEl: () => ({}),
		};
	}
	return { Setting, PluginSettingTab };
});

const { LoamDictateSettingTab, upgradeSettings, DEFAULT_SETTINGS, PROVIDER_FIELDS } = await import("../src/settings");
const { makeTranscriber } = await import("../src/provider");
const { GeminiTranscriber } = await import("../src/gemini");
const { LoamTranscriber } = await import("../src/loam");
type Settings = import("../src/settings").LoamDictateSettings;

function tab(settings: Settings) {
	const plugin = {
		settings,
		saveSettings: vi.fn(async () => {}),
		signals: { path: () => "vibration" as const },
		openTermsNote: vi.fn(async () => {}),
		appendOldTerms: vi.fn(async () => {}),
	};
	const t = new LoamDictateSettingTab({} as never, plugin as never);
	t.display();
	return { t, plugin };
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

describe("the provider switch", () => {
	it("Gemini shows the key as a password field and the model with its default, and no Loam fields", () => {
		tab({ ...DEFAULT_SETTINGS });
		expect(names()).toContain("Transcribe with");
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
		const settings = { ...DEFAULT_SETTINGS };
		const { plugin } = tab(settings);
		await row("Transcribe with").controls[0].onChange!("loam");
		expect(settings.provider).toBe("loam");
		expect(plugin.saveSettings).toHaveBeenCalled();
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
