// The checks Obsidian's community directory runs on submission, run locally:
// eslint-plugin-obsidianmd's recommended set (ESLint core, typescript-eslint
// type-checked rules and the Obsidian rules). `npm run lint`.
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{ ignores: ["main.js", "node_modules/**", "test/**", "design/**", "*.mjs"] },
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: { allowDefaultProject: ["eslint.config.*"] },
			},
		},
		rules: {
			// The plugin's and the services' own names keep their capitals.
			"obsidianmd/ui/sentence-case": ["warn", { brands: ["Loam Dictate", "Loam UI", "Loam", "Gemini", "Google AI Studio", "Google", "GitHub", "Obsidian"] }],
		},
	},
]);
