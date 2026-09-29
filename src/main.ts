import { Editor, MarkdownFileInfo, Notice, Plugin, TFile, requestUrl } from "obsidian";
import { HttpClient, LoamTranscriber } from "./loam";
import { DictateModal } from "./modal";
import { mediaRecorderFactory } from "./recorder";
import { realClock } from "./session";
import { Signals, browserSignalEnv } from "./signals";
import { DEFAULT_SETTINGS, LoamDictateSettingTab, LoamDictateSettings, clampMinutes } from "./settings";
import { Transcriber } from "./transcriber";
import { buildTerms, parseTermsSetting } from "./vocabulary";
import { ScreenWake, browserWakeEnv } from "./wakelock";

export default class LoamDictatePlugin extends Plugin {
	settings: LoamDictateSettings = { ...DEFAULT_SETTINGS };
	private transcriber!: Transcriber;
	private open = new Set<DictateModal>();
	/** Shared by every take, so the settings tab can say how the moments reach this device. */
	readonly signals = new Signals(browserSignalEnv);

	async onload(): Promise<void> {
		await this.loadSettings();
		this.transcriber = this.makeTranscriber();

		this.addCommand({
			id: "dictate",
			name: "Dictate",
			icon: "mic",
			editorCallback: (editor, ctx) => this.dictate(editor, ctx),
		});

		this.addRibbonIcon("mic", "Dictate", () => {
			// The same command, so the ribbon behaves exactly as the toolbar does.
			const editor = this.app.workspace.activeEditor;
			if (editor?.editor) this.dictate(editor.editor, editor);
			else new Notice("Loam Dictate: open a note in edit mode first.");
		});

		this.addSettingTab(new LoamDictateSettingTab(this.app, this));

		// Leaving the note throws the take away, the same rule as the app.
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				const file = this.app.workspace.activeEditor?.file ?? null;
				for (const m of [...this.open]) if (m.file !== file) m.leftTarget();
			}),
		);
	}

	onunload(): void {
		// Closing each sheet releases its microphone.
		for (const m of [...this.open]) m.close();
		this.open.clear();
	}

	/**
	 * The one place a Transcriber is constructed. A second implementation
	 * (a user's own key, later) is chosen here; the sheet does not change.
	 */
	private makeTranscriber(): Transcriber {
		const http: HttpClient = (req) => requestUrl(req);
		return new LoamTranscriber(() => ({ server: this.settings.server, token: this.settings.token }), http);
	}

	private dictate(editor: Editor, ctx: MarkdownFileInfo): void {
		const file = ctx.file;
		if (!file) {
			new Notice("Loam Dictate: open a note in edit mode first.");
			return;
		}
		const terms = () => this.termsFor(file);
		const modal = new DictateModal(
			this.app,
			{ editor, ctx, file },
			{
				recorders: mediaRecorderFactory(),
				transcriber: this.transcriber,
				terms,
				capMs: clampMinutes(this.settings.maxMinutes) * 60_000,
				clock: realClock,
				signal: (m) => this.signals.signal(m),
				awake: new ScreenWake(browserWakeEnv()),
			},
			terms().length,
			(m) => this.open.delete(m),
		);
		this.open.add(modal);
		modal.open();
	}

	private termsFor(file: TFile): string[] {
		const headings = this.app.metadataCache.getFileCache(file)?.headings?.map((h) => h.heading) ?? [];
		return buildTerms(parseTermsSetting(this.settings.terms), file.basename, headings);
	}

	async loadSettings(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as Partial<LoamDictateSettings>;
		this.settings = { ...DEFAULT_SETTINGS, ...data };
		this.settings.maxMinutes = clampMinutes(this.settings.maxMinutes);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
