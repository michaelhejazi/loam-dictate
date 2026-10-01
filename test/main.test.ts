import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { REPO_URL, issueBody, issueUrl, platformName } from "../src/feedback";

// The plugin class over a stand-in for Obsidian: only what main.ts touches at
// runtime. The obsidian package ships types only.
const notices: string[] = [];
vi.mock("obsidian", () => {
	class TFile {
		constructor(public path: string) {}
	}
	class Plugin {
		manifest = { version: "0.3.0" };
		constructor(public app: unknown) {}
	}
	class Notice {
		constructor(message: string) {
			notices.push(message);
		}
	}
	class Stub {}
	return {
		TFile,
		Plugin,
		Notice,
		Modal: Stub,
		MarkdownView: Stub,
		PluginSettingTab: Stub,
		Setting: Stub,
		Platform: { isMobile: true, isAndroidApp: true, isIosApp: false, isMacOS: false, isWin: false, isLinux: true },
		apiVersion: "1.9.14",
		normalizePath: (p: string) => p,
		requestUrl: vi.fn(),
	};
});

const { TFile } = await import("obsidian");
const { default: SpokenPlugin } = await import("../src/main");
const { DEFAULT_SETTINGS } = await import("../src/settings");

/** A vault holding some files, a workspace that records what it opened, and the private settings window. */
function app(files: Record<string, string> = {}) {
	const opened: string[] = [];
	const settingClose = vi.fn();
	const a = {
		vault: {
			adapter: { exists: async (p: string) => p in files, read: async (p: string) => files[p] },
			create: async (p: string, text: string) => void (files[p] = text),
			createFolder: async () => {},
			getAbstractFileByPath: (p: string) => (p in files ? new (TFile as unknown as new (p: string) => object)(p) : null),
		},
		workspace: { getLeaf: () => ({ openFile: async (f: { path: string }) => void opened.push(f.path) }) },
		// Obsidian's private settings window; the plugin must never call it.
		setting: { close: settingClose },
	};
	return { a, files, opened, settingClose };
}

const secrets = {
	geminiKey: "fake-gemini-key-not-a-secret",
};

describe("Report a problem", () => {
	it("pre-fills the plugin version, Obsidian version, platform and provider, and nothing else", () => {
		const plugin = new SpokenPlugin(app().a as never, {} as never);
		plugin.settings = { ...DEFAULT_SETTINGS, ...secrets };
		const url = plugin.reportUrl();
		expect(url.startsWith(`${REPO_URL}/issues/new?body=`)).toBe(true);
		const body = decodeURIComponent(url.slice(url.indexOf("body=") + 5));
		expect(body).toBe(
			issueBody({ pluginVersion: "0.3.0", obsidianVersion: "1.9.14", platform: "mobile, Android", provider: "Gemini, your own key" }),
		);
		expect(body.split("\n").filter((l) => l.startsWith("- "))).toEqual([
			"- Plugin version: 0.3.0",
			"- Obsidian version: 1.9.14",
			"- Platform: mobile, Android",
			"- Provider: Gemini, your own key",
		]);
	});

	it("never carries the key, in any provider", () => {
		for (const provider of ["gemini"] as const) {
			const plugin = new SpokenPlugin(app().a as never, {} as never);
			plugin.settings = { ...DEFAULT_SETTINGS, ...secrets, provider };
			const url = plugin.reportUrl();
			const body = decodeURIComponent(url);
			for (const s of Object.values(secrets)) {
				expect(url).not.toContain(s);
				expect(body).not.toContain(s);
			}
		}
	});

	it("names desktop and the OS on a desktop", () => {
		const desktop = { isMobile: false, isAndroidApp: false, isIosApp: false, isWin: false, isLinux: false };
		expect(platformName({ ...desktop, isMacOS: true })).toBe("desktop, macOS");
		expect(platformName({ ...desktop, isMacOS: false, isWin: true })).toBe("desktop, Windows");
		expect(platformName({ ...desktop, isMobile: true, isIosApp: true, isMacOS: true })).toBe("mobile, iOS");
		expect(issueUrl({ pluginVersion: "1", obsidianVersion: "2", platform: "p", provider: "q" })).toMatch(/^https:\/\/github\.com\/michaelhejazi\/spoken\/issues\/new\?body=/);
	});

	it("the issue template asks for the same four things and says nothing else is needed", () => {
		const template = readFileSync(new URL("../.github/ISSUE_TEMPLATE/problem.md", import.meta.url), "utf8");
		for (const field of ["Plugin version:", "Obsidian version:", "Platform:", "Provider:"]) expect(template).toContain(field);
		expect(template).toMatch(/never.*API key/i);
	});
});

describe("opening the terms note", () => {
	it("creates the note, opens it in a tab, says so in a notice, and never calls the private settings close", async () => {
		const { a, files, opened, settingClose } = app();
		const plugin = new SpokenPlugin(a as never, {} as never);
		plugin.settings = { ...DEFAULT_SETTINGS };
		notices.splice(0);
		await plugin.openTermsNote();
		expect(Object.keys(files)).toEqual(["Dictation terms.md"]);
		expect(opened).toEqual(["Dictation terms.md"]);
		expect(settingClose).not.toHaveBeenCalled();
		expect(notices).toEqual(["Spoken: Dictation terms.md is open in a new tab. Close settings to see it."]);
	});

	it("no source file reaches for app.setting", () => {
		const dir = new URL("../src/", import.meta.url);
		for (const f of readdirSync(dir)) {
			expect(readFileSync(new URL(f, dir), "utf8"), f).not.toMatch(/\.setting\b|\bsetting\?\./);
		}
	});
});
