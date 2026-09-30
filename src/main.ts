import { Editor, MarkdownFileInfo, Notice, Plugin, TFile, normalizePath, requestUrl } from "obsidian";
import { HttpClient } from "./http";
import { DictateModal } from "./modal";
import { makeTranscriber } from "./provider";
import { mediaRecorderFactory } from "./recorder";
import { realClock } from "./session";
import { Signals, browserSignalEnv } from "./signals";
import { DEFAULT_SETTINGS, LoamDictateSettingTab, LoamDictateSettings, clampMinutes, upgradeSettings } from "./settings";
import { NoteStore, ensureTermsNote, moveOldTerms, readTermsNote, termsPath } from "./termsnote";
import { buildTerms } from "./vocabulary";
import { ScreenWake, browserWakeEnv } from "./wakelock";

export default class LoamDictatePlugin extends Plugin {
	settings: LoamDictateSettings = { ...DEFAULT_SETTINGS };
	private open = new Set<DictateModal>();
	/** Shared by every take, so the settings tab can say how the moments reach this device. */
	readonly signals = new Signals(browserSignalEnv);

	async onload(): Promise<void> {
		await this.loadSettings();
		// The vault's files are known once the layout is ready.
		this.app.workspace.onLayoutReady(() => void this.moveOldTerms());

		this.addCommand({
			id: "dictate",
			name: "Dictate",
			icon: "mic",
			editorCallback: (editor, ctx) => void this.dictate(editor, ctx),
		});

		this.addRibbonIcon("mic", "Dictate", () => {
			// The same command, so the ribbon behaves exactly as the toolbar does.
			const editor = this.app.workspace.activeEditor;
			if (editor?.editor) void this.dictate(editor.editor, editor);
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

	private async dictate(editor: Editor, ctx: MarkdownFileInfo): Promise<void> {
		const file = ctx.file;
		if (!file) {
			new Notice("Loam Dictate: open a note in edit mode first.");
			return;
		}
		const terms = () => this.termsFor(file);
		const http: HttpClient = (req) => requestUrl(req);
		const termCount = (await terms()).length;
		const modal = new DictateModal(
			this.app,
			{ editor, ctx, file },
			{
				recorders: mediaRecorderFactory(),
				transcriber: makeTranscriber(() => this.settings, http),
				terms,
				capMs: clampMinutes(this.settings.maxMinutes) * 60_000,
				clock: realClock,
				signal: (m) => this.signals.signal(m),
				awake: new ScreenWake(browserWakeEnv()),
			},
			termCount,
			(m) => this.open.delete(m),
		);
		this.open.add(modal);
		modal.open();
	}

	/** Read fresh from the note on every take: the note's terms, then this note's title and headings. */
	private async termsFor(file: TFile): Promise<string[]> {
		const headings = this.app.metadataCache.getFileCache(file)?.headings?.map((h) => h.heading) ?? [];
		return buildTerms(await readTermsNote(this.notes, this.termsPath()), file.basename, headings);
	}

	private termsPath(): string {
		return normalizePath(termsPath(this.settings.termsPath));
	}

	/** The vault as src/termsnote.ts sees it. Reads go to the disk, so an edit synced a moment ago counts. */
	private readonly notes: NoteStore = {
		exists: (path) => this.app.vault.adapter.exists(path),
		read: (path) => this.app.vault.adapter.read(path),
		create: async (path, text) => {
			const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
			if (folder && !(await this.app.vault.adapter.exists(folder))) await this.app.vault.createFolder(folder);
			await this.app.vault.create(path, text);
		},
	};

	private async moveOldTerms(): Promise<void> {
		const had = this.settings.terms !== undefined;
		const moved = await moveOldTerms(this.settings, this.notes, this.termsPath());
		if (had && this.settings.terms === undefined) await this.saveSettings();
		if (moved === "moved into the note") {
			new Notice(`Loam Dictate: your names and terms are now in the note ${this.termsPath()}.`);
		}
	}

	/** Opens the terms note in a new tab, creating it first if it isn't there. */
	async openTermsNote(): Promise<void> {
		const path = this.termsPath();
		await ensureTermsNote(this.notes, path);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		// Close settings so the note is in view; not in Obsidian's public API, so only if it is there.
		(this.app as unknown as { setting?: { close?: () => void } }).setting?.close?.();
		await this.app.workspace.getLeaf("tab").openFile(file);
	}

	/** Adds 0.1.x's list to the end of the terms note and drops it from settings. */
	async appendOldTerms(): Promise<void> {
		const lines = (this.settings.terms ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
		const path = this.termsPath();
		await ensureTermsNote(this.notes, path);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		if (lines.length) await this.app.vault.process(file, (text) => text.replace(/\n*$/, "\n") + lines.join("\n") + "\n");
		delete this.settings.terms;
		await this.saveSettings();
	}

	async loadSettings(): Promise<void> {
		const { settings, changed } = upgradeSettings(await this.loadData());
		this.settings = settings;
		if (changed) await this.saveSettings();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
