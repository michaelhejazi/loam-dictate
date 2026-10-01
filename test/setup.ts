// The plugin calls timers through `window` (Obsidian's guideline, for popout
// windows). Under Node the tests give it the global object as its window.
const g = globalThis as unknown as { window?: unknown };
g.window ??= globalThis;
