import { App, PluginSettingTab, Setting } from "obsidian";
import { DEFAULT_MODEL } from "./gemini";
import type LoamDictatePlugin from "./main";
import { PROVIDERS, Provider, ProviderSettings } from "./provider";
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

export class LoamDictateSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: LoamDictatePlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Transcribe with")
			.setDesc("Who turns the recording into words.")
			.addDropdown((d) =>
				d
					.addOptions(PROVIDERS)
					.setValue(s.provider)
					.onChange(async (v) => {
						s.provider = v as Provider;
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (s.provider === "gemini") this.gemini();
		else this.loam();

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "To put Dictate on the phone's toolbar: Settings → Toolbar → Add global command → Loam Dictate: Dictate.",
		});

		new Setting(containerEl)
			.setName("Longest recording")
			.setDesc(`Whole minutes, ${MIN_MINUTES}–${MAX_MINUTES}. Recording stops by itself at this length.`)
			.addSlider((sl) =>
				sl
					.setLimits(MIN_MINUTES, MAX_MINUTES, 1)
					.setValue(s.maxMinutes)
					.setDynamicTooltip()
					.onChange(async (v) => {
						s.maxMinutes = clampMinutes(v);
						await this.plugin.saveSettings();
					}),
			);

		containerEl.createEl("p", { cls: "setting-item-description", text: signalLine(this.plugin.signals.path()) });

		new Setting(containerEl)
			.setName("Names and terms note")
			.setDesc(
				"A note in this vault of names and terms you want spelled right, one per line. It is read on every take, with the open note's title and headings added.",
			)
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_TERMS_PATH)
					.setValue(s.termsPath)
					.onChange(async (v) => {
						s.termsPath = v.trim() || DEFAULT_TERMS_PATH;
						await this.plugin.saveSettings();
					}),
			)
			.addButton((b) => b.setButtonText("Open").onClick(() => void this.plugin.openTermsNote()));

		if (s.terms !== undefined) this.oldTerms(s.terms);
	}

	private gemini(): void {
		const s = this.plugin.settings;
		this.containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Get a key at aistudio.google.com → Get API key. Recordings go from this device to Google under your key and nowhere else.",
		});
		new Setting(this.containerEl)
			.setName(PROVIDER_FIELDS.gemini[0])
			.setDesc("Stored in plain text in this plugin's settings file inside the vault.")
			.addText((t) => {
				t.inputEl.type = "password";
				t.inputEl.autocomplete = "off";
				t.setValue(s.geminiKey).onChange(async (v) => {
					s.geminiKey = v.trim();
					await this.plugin.saveSettings();
				});
			});
		new Setting(this.containerEl)
			.setName(PROVIDER_FIELDS.gemini[1])
			.setDesc(
				`The Gemini model that transcribes. ${DEFAULT_MODEL} is Google's speech-to-text model; change this only when Google names a newer one.`,
			)
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_MODEL)
					.setValue(s.geminiModel)
					.onChange(async (v) => {
						s.geminiModel = v.trim() || DEFAULT_MODEL;
						await this.plugin.saveSettings();
					}),
			);
	}

	private loam(): void {
		const s = this.plugin.settings;
		this.containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Find the server address and token in Loam UI → Settings → Dictation → Obsidian.",
		});
		new Setting(this.containerEl)
			.setName(PROVIDER_FIELDS.loam[0])
			.setDesc("The address of your Loam UI server. Takes are sent here and nowhere else.")
			.addText((t) =>
				t
					.setPlaceholder("https://loam.example.net")
					.setValue(s.server)
					.onChange(async (v) => {
						s.server = v.trim();
						await this.plugin.saveSettings();
					}),
			);
		new Setting(this.containerEl)
			.setName(PROVIDER_FIELDS.loam[1])
			.setDesc("Stored in plain text in this plugin's settings file inside the vault.")
			.addText((t) => {
				t.inputEl.type = "password";
				t.inputEl.autocomplete = "off";
				t.setValue(s.token).onChange(async (v) => {
					s.token = v.trim();
					await this.plugin.saveSettings();
				});
			});
	}

	/** 0.1.x's list, still in settings because the note already existed. Nothing reads it. */
	private oldTerms(terms: string): void {
		const count = terms.split(/\r?\n/).filter((l) => l.trim()).length;
		new Setting(this.containerEl)
			.setName("Names and terms from before 0.2")
			.setDesc(
				`${count} ${count === 1 ? "term is" : "terms are"} still in this plugin's settings and not used, because the terms note already existed. Add them to the end of the note, or forget them.`,
			)
			.addButton((b) => b.setButtonText("Add to note").onClick(() => void this.plugin.appendOldTerms().then(() => this.display())))
			.addButton((b) =>
				b.setButtonText("Forget").onClick(async () => {
					delete this.plugin.settings.terms;
					await this.plugin.saveSettings();
					this.display();
				}),
			);
	}
}

/** One line on how the three moments reach this device; no setting, just what is in use. */
export function signalLine(path: SignalPath): string {
	switch (path) {
		case "vibration":
			return "Alerts: vibration, a tap when recording starts, two pulses thirty seconds before the longest recording, one long pulse when it stops there.";
		case "tone: no vibration":
			return "Alerts: a soft tone thirty seconds before the longest recording and when it stops there, because Obsidian has no vibration on this device.";
		case "tone: vibration refused":
			return "Alerts: a soft tone thirty seconds before the longest recording and when it stops there, because this device refused to vibrate for Obsidian.";
	}
}
