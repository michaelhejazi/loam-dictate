import { App, PluginSettingTab, Setting } from "obsidian";
import type LoamDictatePlugin from "./main";
import type { SignalPath } from "./signals";

export interface LoamDictateSettings {
	server: string;
	token: string;
	/** Longest recording, whole minutes 1–15. */
	maxMinutes: number;
	/** Names and terms, one per line. */
	terms: string;
}

export const DEFAULT_SETTINGS: LoamDictateSettings = {
	server: "",
	token: "",
	maxMinutes: 5,
	terms: "",
};

export const MIN_MINUTES = 1;
export const MAX_MINUTES = 15;

export function clampMinutes(n: unknown): number {
	const v = Math.round(Number(n));
	if (!Number.isFinite(v)) return DEFAULT_SETTINGS.maxMinutes;
	return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, v));
}

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

		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Find the server address and token in Loam UI → Settings → Dictation → Obsidian.",
		});
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "To put Dictate on the phone's toolbar: Settings → Toolbar → Add global command → Loam Dictate: Dictate.",
		});

		new Setting(containerEl)
			.setName("Server address")
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

		new Setting(containerEl)
			.setName("Token")
			.setDesc("Kept in this device's plugin data, not in your notes.")
			.addText((t) => {
				t.inputEl.type = "password";
				t.inputEl.autocomplete = "off";
				t.setValue(s.token).onChange(async (v) => {
					s.token = v.trim();
					await this.plugin.saveSettings();
				});
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
			.setName("Names and terms")
			.setDesc("Names and terms you want spelled right")
			.addTextArea((t) => {
				t.inputEl.rows = 8;
				t.setPlaceholder("One per line").setValue(s.terms).onChange(async (v) => {
					s.terms = v;
					await this.plugin.saveSettings();
				});
			});
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
