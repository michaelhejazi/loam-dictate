import { App, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import { DEFAULT_MODEL } from "./gemini";
import type LoamDictatePlugin from "./main";
import { PROVIDERS, Provider, ProviderSettings, visibleProviders } from "./provider";
import type { SignalPath } from "./signals";
import { DEFAULT_TERMS_PATH } from "./termsnote";

export interface LoamDictateSettings extends ProviderSettings {
	/** Longest recording, whole minutes 1–15. */
	maxMinutes: number;
	/** The vault path of the names-and-terms note. */
	termsPath: string;
	/**
	 * 0.1.x's in-settings list, one per line. Never read for a take: moved into
	 * the terms note once, or kept here until the user chooses (src/termsnote.ts).
	 */
	terms?: string;
}

export const DEFAULT_SETTINGS: LoamDictateSettings = {
	provider: "gemini",
	geminiKey: "",
	geminiModel: DEFAULT_MODEL,
	server: "",
	token: "",
	maxMinutes: 5,
	termsPath: DEFAULT_TERMS_PATH,
};

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 15;

export function clampMinutes(n: unknown): number {
	const v = Math.round(Number(n));
	if (!Number.isFinite(v)) return DEFAULT_SETTINGS.maxMinutes;
	return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, v));
}

/**
 * Settings as saved, brought up to date. 0.1.x saved no provider: an install
 * with a Loam address or token stays on Loam, anything else is new and gets
 * Gemini. `changed` says whether the result should be saved back.
 */
export function upgradeSettings(data: unknown): { settings: LoamDictateSettings; changed: boolean } {
	const saved = (data && typeof data === "object" ? data : {}) as Partial<LoamDictateSettings>;
	const settings: LoamDictateSettings = { ...DEFAULT_SETTINGS, ...saved };
	let changed = false;
	if (saved.provider !== "gemini" && saved.provider !== "loam") {
		const wasLoam = Boolean(saved.server?.trim() || saved.token?.trim());
		settings.provider = wasLoam ? "loam" : "gemini";
		changed = wasLoam;
	}
	settings.maxMinutes = clampMinutes(settings.maxMinutes);
	return { settings, changed };
}

/** The settings each provider shows, by name; the tab draws exactly these. */
export const PROVIDER_FIELDS: Record<Provider, string[]> = {
	gemini: ["Gemini API key", "Model"],
	loam: ["Server address", "Token"],
};

/** What each saved field becomes when typed into, before it is saved. */
const NORMALISE: Partial<Record<keyof LoamDictateSettings, (v: unknown) => unknown>> = {
	geminiKey: (v) => String(v).trim(),
	geminiModel: (v) => String(v).trim() || DEFAULT_MODEL,
	server: (v) => String(v).trim(),
	token: (v) => String(v).trim(),
	maxMinutes: clampMinutes,
	termsPath: (v) => String(v).trim() || DEFAULT_TERMS_PATH,
};

/**
 * Declarative, so every row is in Obsidian's settings search (1.13+). Plain
 * fields are `control`s; the rows with a password field, a button or a link
 * are `render`s, which are searched by their name and description all the same.
 */
export class LoamDictateSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: LoamDictatePlugin,
	) {
		super(app, plugin);
	}

	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof LoamDictateSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const k = key as keyof LoamDictateSettings;
		const normalise = NORMALISE[k];
		Object.assign(this.plugin.settings, { [k]: normalise ? normalise(value) : value });
		await this.plugin.saveSettings();
		// The provider decides which fields are shown.
		if (k === "provider") this.refreshDomState();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const s = this.plugin.settings;
		const on = (p: Provider) => () => s.provider === p;
		// With one provider to offer there is nothing to choose, so no dropdown.
		const offered = visibleProviders(s);
		return [
			{
				name: "Transcribe with",
				desc: "Who turns the recording into words.",
				visible: offered.length > 1,
				control: { type: "dropdown", key: "provider", options: Object.fromEntries(offered.map((p) => [p, PROVIDERS[p]])) },
			},
			{
				name: PROVIDER_FIELDS.gemini[0],
				desc: GEMINI_KEY_DESC,
				aliases: ["Check key", "How to get a Gemini API key", "Google AI Studio"],
				visible: on("gemini"),
				render: (setting) => this.geminiKey(setting),
			},
			{
				name: PROVIDER_FIELDS.gemini[1],
				desc: `The Gemini model that transcribes. ${DEFAULT_MODEL} is Google's speech-to-text model; change this only when Google names a newer one.`,
				visible: on("gemini"),
				control: { type: "text", key: "geminiModel", placeholder: DEFAULT_MODEL },
			},
			{
				name: PROVIDER_FIELDS.loam[0],
				desc: "The address of your Loam UI server. Takes are sent here and nowhere else. Find it and the token in Loam UI → Settings → Dictation → Obsidian.",
				visible: on("loam"),
				control: { type: "text", key: "server", placeholder: "https://loam.example.net" },
			},
			{
				name: PROVIDER_FIELDS.loam[1],
				desc: LOAM_TOKEN_DESC,
				visible: on("loam"),
				render: (setting) => {
					setting.setName(PROVIDER_FIELDS.loam[1]).setDesc(LOAM_TOKEN_DESC);
					setting.addText((t) => {
						t.inputEl.type = "password";
						t.inputEl.autocomplete = "off";
						t.setValue(s.token).onChange((v) => this.setControlValue("token", v));
					});
				},
			},
			{
				name: "Dictate from the phone's toolbar",
				desc: "Settings → Toolbar → Add global command → Loam Dictate: Dictate.",
				aliases: ["Mobile toolbar"],
			},
			{
				name: "Longest recording",
				desc: `Whole minutes, ${MIN_MINUTES}–${MAX_MINUTES}. Recording stops by itself at this length.`,
				control: { type: "slider", key: "maxMinutes", min: MIN_MINUTES, max: MAX_MINUTES, step: 1 },
			},
			{
				name: "Alerts",
				desc: signalLine(this.plugin.signals.path()),
				aliases: ["Vibration", "Haptics", "Tone"],
			},
			{
				name: "Names and terms note",
				desc: TERMS_NOTE_DESC,
				aliases: ["Vocabulary", "Spelling"],
				render: (setting) => {
					setting
						.setName("Names and terms note")
						.setDesc(TERMS_NOTE_DESC)
						.addText((t) =>
							t
								.setPlaceholder(DEFAULT_TERMS_PATH)
								.setValue(s.termsPath)
								.onChange((v) => this.setControlValue("termsPath", v)),
						)
						.addButton((b) => b.setButtonText("Open").onClick(() => void this.plugin.openTermsNote()));
				},
			},
			{
				name: OLD_TERMS_NAME,
				visible: () => s.terms !== undefined,
				render: (setting) => this.oldTerms(setting),
			},
			{
				name: "Report a problem",
				desc: REPORT_DESC,
				aliases: ["Bug", "Issue"],
				render: (setting) => {
					setting.setName("Report a problem").setDesc(REPORT_DESC);
					setting.controlEl.createEl("a", { text: "Open an issue", href: this.plugin.reportUrl() });
				},
			},
		];
	}

	/** The key as a password field, Check key beside it, its answer and the steps to a key folded under it. */
	private geminiKey(setting: Setting): void {
		const s = this.plugin.settings;
		setting.setName(PROVIDER_FIELDS.gemini[0]).setDesc(GEMINI_KEY_DESC);
		const result = setting.descEl.createEl("p", { cls: "setting-item-description loam-dictate-keycheck" });
		this.keyHelp(setting.descEl);
		setting
			.addText((t) => {
				t.inputEl.type = "password";
				t.inputEl.autocomplete = "off";
				t.setValue(s.geminiKey).onChange((v) => this.setControlValue("geminiKey", v));
			})
			.addButton((b) =>
				b.setButtonText("Check key").onClick(async () => {
					result.setText("Checking…");
					result.setAttr("data-outcome", "checking");
					const check = await this.plugin.checkGeminiKey();
					result.setText(check.sentence);
					result.setAttr("data-outcome", check.outcome);
				}),
			);
	}

	/** The steps to a key, folded under the key field. The README repeats KEY_STEPS word for word. */
	private keyHelp(parent: HTMLElement): void {
		const details = parent.createEl("details", { cls: "loam-dictate-keyhelp" });
		details.createEl("summary", { text: "How to get a Gemini API key" });
		const list = details.createEl("ol");
		for (const step of KEY_STEPS) {
			const li = list.createEl("li");
			for (const part of step) {
				if (typeof part === "string") li.appendText(part);
				else li.createEl("a", { text: part.text, href: part.href });
			}
		}
		const pricing = details.createEl("p");
		for (const part of KEY_PRICING) {
			if (typeof part === "string") pricing.appendText(part);
			else pricing.createEl("a", { text: part.text, href: part.href });
		}
	}

	/** 0.1.x's list, still in settings because the note already existed. Nothing reads it. */
	private oldTerms(setting: Setting): void {
		const count = (this.plugin.settings.terms ?? "").split(/\r?\n/).filter((l) => l.trim()).length;
		setting
			.setName(OLD_TERMS_NAME)
			.setDesc(
				`${count} ${count === 1 ? "term is" : "terms are"} still in this plugin's settings and not used, because the terms note already existed. Add them to the end of the note, or forget them.`,
			)
			.addButton((b) => b.setButtonText("Add to note").onClick(() => void this.plugin.appendOldTerms().then(() => this.refreshDomState())))
			.addButton((b) =>
				b.setButtonText("Forget").onClick(async () => {
					delete this.plugin.settings.terms;
					await this.plugin.saveSettings();
					this.refreshDomState();
				}),
			);
	}
}

const GEMINI_KEY_DESC =
	"Recordings go from this device to Google under your key and nowhere else. The key is stored in plain text in this plugin's settings file inside the vault.";
const LOAM_TOKEN_DESC = "Stored in plain text in this plugin's settings file inside the vault.";
const TERMS_NOTE_DESC =
	"A note in this vault of names and terms you want spelled right, one per line. It is read on every take, with the open note's title and headings added.";
const OLD_TERMS_NAME = "Names and terms from before 0.2";
const REPORT_DESC =
	"Opens a new issue on GitHub with the plugin version, Obsidian version, platform and provider filled in. Never your key, a server address or a recording.";

type Part = string | { text: string; href: string };

export const AI_STUDIO_KEYS_URL = "https://aistudio.google.com/apikey";
export const GEMINI_PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing";

/** Google AI Studio's steps as Google's API key page described them on 2026-10-01. */
export const KEY_STEPS: Part[][] = [
	["Open ", { text: "Google AI Studio's API keys page", href: AI_STUDIO_KEYS_URL }, " and sign in with a Google account."],
	[
		"Select Create API key. The first time, Google asks you to accept its terms of service, and AI Studio may then create a Google Cloud project and a key for you.",
	],
	["Copy the key, paste it into Gemini API key in Loam Dictate's settings, and press Check key."],
	["Treat the key like a password: anyone who has it can use your quota."],
];
export const KEY_PRICING: Part[] = [
	"Whether you pay, and how much, is on ",
	{ text: "Google's Gemini API pricing page", href: GEMINI_PRICING_URL },
	".",
];

/** The Alerts row: how the three moments reach this device; no setting, just what is in use. */
export function signalLine(path: SignalPath): string {
	switch (path) {
		case "vibration":
			return "Vibration: a tap when recording starts, two pulses thirty seconds before the longest recording, one long pulse when it stops there.";
		case "tone: no vibration":
			return "A soft tone thirty seconds before the longest recording and when it stops there, because Obsidian has no vibration on this device.";
		case "tone: vibration refused":
			return "A soft tone thirty seconds before the longest recording and when it stops there, because this device refused to vibrate for Obsidian.";
	}
}
