import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	AutocompleteItem,
	BeforeAgentStartEventResult,
	ExtensionAPI,
	ExtensionContext,
} from "@oh-my-pi/pi-coding-agent";

/**
 * Profile text location. OMP_JB_PROFILE wins. The second path is the name
 * earlier installs used.
 */
const PROFILE_CANDIDATES = [
	join(homedir(), ".omp", "agent", "jb", "profile.md"),
	join(homedir(), ".omp", "agent", "jb", "deepseekv4.1 and v4.1-1017.md"),
];

const PROFILE_OVERRIDE = process.env.OMP_JB_PROFILE;

const STATUS_KEY = "jb";
const ENTRY_TYPE = "jb-state";

/** Shown only while active. */
const LABEL_ON = "🔓";

interface JbState {
	on: boolean;
	text?: string;
}

export default function jb(pi: ExtensionAPI) {
	const enabled = new Map<string, boolean>();
	const body = new Map<string, string>();
	const resolved = new Map<string, string>();

	function sessionId(ctx: ExtensionContext): string {
		return ctx.sessionManager.getSessionId();
	}

	/** Text is persisted with the flag so a resume keeps the original policy. */
	function restore(ctx: ExtensionContext): boolean {
		const id = sessionId(ctx);
		if (enabled.has(id)) return true;
		let on = false;
		let text: string | undefined;
		let found = false;
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type !== "custom" || entry.customType !== ENTRY_TYPE) continue;
			const data = entry.data as JbState | undefined;
			if (typeof data?.on !== "boolean") continue;
			found = true;
			on = data.on;
			if (typeof data.text === "string" && data.text.length > 0) text = data.text;
		}
		enabled.set(id, on);
		if (text !== undefined) body.set(id, text);
		return found;
	}

	function persist(ctx: ExtensionContext, on: boolean): void {
		const id = sessionId(ctx);
		pi.appendEntry<JbState>(ENTRY_TYPE, { on, text: body.get(id) });
	}

	async function load(ctx: ExtensionContext): Promise<string | undefined> {
		const id = sessionId(ctx);
		const cached = body.get(id);
		if (cached !== undefined) return cached;

		const candidates = PROFILE_OVERRIDE ? [PROFILE_OVERRIDE] : PROFILE_CANDIDATES;
		let lastError: unknown;
		for (const path of candidates) {
			try {
				const value = (await readFile(path, "utf8")).trimEnd();
				body.set(id, value);
				resolved.set(id, path);
				return value;
			} catch (error) {
				lastError = error;
			}
		}
		if (ctx.hasUI) {
			ctx.ui.notify(`jb: no profile file found at ${candidates.join(" or ")}`, "error");
		}
		pi.logger.warn(`jb: profile read failed: ${String(lastError)}`);
		return undefined;
	}

	function paint(ctx: ExtensionContext, on: boolean): void {
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, on ? LABEL_ON : undefined);
	}

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.agent.kind !== "main") return;
		const id = sessionId(ctx);
		const restored = restore(ctx);
		const fromEnv = process.env.OMP_JB === "1" || process.env.OMP_JB === "true";
		if (fromEnv && !restored) enabled.set(id, true);
		const on = enabled.get(id) === true;
		if (on) {
			await load(ctx);
			if (fromEnv && !restored) persist(ctx, true);
		}
		paint(ctx, on);
	});

	pi.on(
		"before_agent_start",
		async (event, ctx): Promise<BeforeAgentStartEventResult | undefined> => {
			if (ctx.agent.kind !== "main") return undefined;
			const id = sessionId(ctx);
			if (!enabled.get(id)) {
				paint(ctx, false);
				return undefined;
			}
			const text = await load(ctx);
			if (!text) {
				enabled.set(id, false);
				paint(ctx, false);
				return undefined;
			}
			paint(ctx, true);
			return { systemPrompt: [...event.systemPrompt, text] };
		},
	);

	pi.on("session_shutdown", (_event, ctx) => {
		const id = sessionId(ctx);
		enabled.delete(id);
		body.delete(id);
		resolved.delete(id);
		if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	pi.registerCommand("jb", {
		description: "Toggle the jb profile for this session",
		getArgumentCompletions(argumentPrefix: string): AutocompleteItem[] | null {
			if (argumentPrefix.includes(" ")) return null;
			const prefix = argumentPrefix.trim().toLowerCase();
			const items: AutocompleteItem[] = [
				{
					label: "on",
					value: "on ",
					description: "Inject the profile into this session's system prompt",
				},
				{
					label: "off",
					value: "off ",
					description: "Stop injecting; the cached text is dropped at shutdown",
				},
				{
					label: "reload",
					value: "reload ",
					description: "Re-read the profile file now; invalidates the prompt cache once",
				},
				{
					label: "status",
					value: "status ",
					description: "Show whether jb is active and which file it reads",
				},
			];
			const matches = items.filter(item => item.label.startsWith(prefix));
			return matches.length > 0 ? matches : null;
		},
		handler: async (args, ctx) => {
			if (ctx.agent.kind !== "main") {
				ctx.ui.notify("jb: main session only", "warning");
				return;
			}
			const id = sessionId(ctx);
			const cmd = args.trim().toLowerCase();

			if (cmd === "on") {
				const text = await load(ctx);
				if (!text) {
					enabled.set(id, false);
					paint(ctx, false);
					persist(ctx, false);
					return;
				}
				enabled.set(id, true);
				paint(ctx, true);
				persist(ctx, true);
				ctx.ui.notify(`jb on (${text.length} chars)`, "info");
				return;
			}

			if (cmd === "off") {
				enabled.set(id, false);
				paint(ctx, false);
				persist(ctx, false);
				ctx.ui.notify("jb off", "info");
				return;
			}

			if (cmd === "reload") {
				body.delete(id);
				const text = await load(ctx);
				if (!text) {
					paint(ctx, false);
					return;
				}
				persist(ctx, enabled.get(id) === true);
				ctx.ui.notify(`jb reloaded (${text.length} chars)`, "info");
				return;
			}

			const on = enabled.get(id) === true;
			const path = resolved.get(id) ?? PROFILE_OVERRIDE ?? PROFILE_CANDIDATES[0];
			ctx.ui.notify(`jb ${on ? "on" : "off"} (${path})`, "info");
		},
	});
}
