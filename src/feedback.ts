// "Report a problem": a link to a new GitHub issue on this plugin's repository
// with the body filled in. The body carries the plugin version, the Obsidian
// version, the platform and the provider in use, and nothing else: never a
// key or a recording. .github/ISSUE_TEMPLATE/problem.md asks
// for the same four things.

export const REPO_URL = "https://github.com/michaelhejazi/spoken";

export interface ReportInfo {
	pluginVersion: string;
	obsidianVersion: string;
	/** "desktop, macOS", "mobile, Android" */
	platform: string;
	/** The provider's name as the settings tab shows it. */
	provider: string;
}

export function issueBody(info: ReportInfo): string {
	return [
		"**What happened**",
		"",
		"<!-- What you did, what you expected, and what you saw instead. Please don't paste your API key or attach a recording. -->",
		"",
		"**Where** (filled in by Spoken)",
		"",
		`- Plugin version: ${info.pluginVersion}`,
		`- Obsidian version: ${info.obsidianVersion}`,
		`- Platform: ${info.platform}`,
		`- Provider: ${info.provider}`,
		"",
	].join("\n");
}

export function issueUrl(info: ReportInfo): string {
	return `${REPO_URL}/issues/new?body=${encodeURIComponent(issueBody(info))}`;
}

/** The subset of Obsidian's Platform flags the report reads. */
export interface PlatformFlags {
	isMobile: boolean;
	isAndroidApp: boolean;
	isIosApp: boolean;
	isMacOS: boolean;
	isWin: boolean;
	isLinux: boolean;
}

export function platformName(p: PlatformFlags): string {
	const kind = p.isMobile ? "mobile" : "desktop";
	const os = p.isAndroidApp
		? "Android"
		: p.isIosApp
			? "iOS"
			: p.isMacOS
				? "macOS"
				: p.isWin
					? "Windows"
					: p.isLinux
						? "Linux"
						: "unknown OS";
	return `${kind}, ${os}`;
}
