/**
 * Tool Gate Extension
 *
 * Blocks configured groups of tools until the user enables them with /tool enable.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ToolGateConfig = Record<string, string[]>;

type GateState = {
	config: ToolGateConfig;
	resolvedGroups: Map<string, string[]>;
	gatedTools: Set<string>;
	enabledTools: Set<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonFile(path: string): Record<string, unknown> {
	if (!existsSync(path)) return {};

	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
		if (!isRecord(parsed)) {
			throw new Error("settings file must contain a JSON object");
		}
		return parsed;
	} catch (error) {
		throw new Error(`Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function parseConfig(rawConfig: unknown, sourceLabel = "toolGate"): ToolGateConfig {
	if (rawConfig === undefined) return {};
	if (!isRecord(rawConfig)) {
		throw new Error(`${sourceLabel} must be an object`);
	}

	const config: ToolGateConfig = {};
	for (const [groupName, refs] of Object.entries(rawConfig)) {
		if (!Array.isArray(refs)) {
			throw new Error(`toolGate.${groupName} must be an array`);
		}

		const parsedRefs: string[] = [];
		for (const ref of refs) {
			if (typeof ref !== "string" || ref.trim() === "") {
				throw new Error(`toolGate.${groupName} must contain only non-empty strings`);
			}
			parsedRefs.push(ref);
		}

		config[groupName] = parsedRefs;
	}

	return config;
}

function readToolGateSettings(cwd: string, includeProjectSettings: boolean): ToolGateConfig {
	const globalSettings = readJsonFile(join(homedir(), ".pi", "agent", "settings.json"));
	const projectSettings = includeProjectSettings ? readJsonFile(join(cwd, ".pi", "settings.json")) : {};

	return {
		...parseConfig(globalSettings.toolGate, "global settings toolGate"),
		...parseConfig(projectSettings.toolGate, "project settings toolGate"),
	};
}

function validateAndResolve(config: ToolGateConfig, registeredToolNames: Set<string>): Map<string, string[]> {
	for (const groupName of Object.keys(config)) {
		if (registeredToolNames.has(groupName)) {
			throw new Error(`toolGate group "${groupName}" clashes with a registered tool name`);
		}
	}

	for (const [groupName, refs] of Object.entries(config)) {
		for (const ref of refs) {
			if (!registeredToolNames.has(ref) && !(ref in config)) {
				throw new Error(`toolGate group "${groupName}" references unknown tool or group "${ref}"`);
			}
		}
	}

	const resolved = new Map<string, string[]>();
	const visiting = new Set<string>();
	const visited = new Set<string>();

	function resolveGroup(groupName: string, path: string[]): string[] {
		const cached = resolved.get(groupName);
		if (cached) return cached;

		if (visiting.has(groupName)) {
			throw new Error(`toolGate cycle detected: ${[...path, groupName].join(" -> ")}`);
		}

		visiting.add(groupName);
		const tools: string[] = [];
		const seenTools = new Set<string>();

		for (const ref of config[groupName] ?? []) {
			const nestedTools = registeredToolNames.has(ref) ? [ref] : resolveGroup(ref, [...path, groupName]);
			for (const toolName of nestedTools) {
				if (!seenTools.has(toolName)) {
					seenTools.add(toolName);
					tools.push(toolName);
				}
			}
		}

		visiting.delete(groupName);
		visited.add(groupName);
		resolved.set(groupName, tools);
		return tools;
	}

	for (const groupName of Object.keys(config)) {
		if (!visited.has(groupName)) {
			resolveGroup(groupName, []);
		}
	}

	return resolved;
}

function uniqueToolNames(toolNames: Iterable<string>): string[] {
	return Array.from(new Set(toolNames));
}

function getGroupStatus(tools: string[], enabledTools: Set<string>): "blocked" | "partial" | "enabled" {
	if (tools.length === 0) return "blocked";
	const enabledCount = tools.filter((toolName) => enabledTools.has(toolName)).length;
	if (enabledCount === 0) return "blocked";
	if (enabledCount === tools.length) return "enabled";
	return "partial";
}

function formatStatus(state: GateState): string {
	const lines = ["Tool gates:"];
	for (const groupName of Object.keys(state.config).sort()) {
		const tools = state.resolvedGroups.get(groupName) ?? [];
		const status = getGroupStatus(tools, state.enabledTools);
		lines.push(`- ${groupName}: ${status} (${tools.join(", ")})`);
	}
	return lines.join("\n");
}

function createEmptyState(): GateState {
	return {
		config: {},
		resolvedGroups: new Map(),
		gatedTools: new Set(),
		enabledTools: new Set(),
	};
}

export default function toolGateExtension(pi: ExtensionAPI) {
	let state = createEmptyState();

	function applyBlockedTools() {
		const activeTools = pi.getActiveTools();
		pi.setActiveTools(activeTools.filter((toolName) => !state.gatedTools.has(toolName) || state.enabledTools.has(toolName)));
	}

	function resetState(cwd: string, includeProjectSettings: boolean) {
		const allToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
		const config = readToolGateSettings(cwd, includeProjectSettings);
		const resolvedGroups = validateAndResolve(config, allToolNames);
		const gatedTools = new Set(Array.from(resolvedGroups.values()).flat());

		state = {
			config,
			resolvedGroups,
			gatedTools,
			enabledTools: new Set(),
		};

		applyBlockedTools();
	}

	pi.on("session_start", (_event, ctx) => {
		resetState(ctx.cwd, ctx.isProjectTrusted());
	});

	pi.on("session_shutdown", () => {
		state.enabledTools.clear();
		applyBlockedTools();
	});

	pi.on("tool_call", (event) => {
		if (!state.gatedTools.has(event.toolName)) return undefined;
		if (state.enabledTools.has(event.toolName)) return undefined;

		return {
			block: true,
			reason: `Tool "${event.toolName}" is blocked by tool-gate. Ask the user to run /tool enable <group>.`,
		};
	});

	pi.registerCommand("tool", {
		description: "Manage gated tool groups: /tool status, /tool enable <group> [group...]",
		getArgumentCompletions: (argumentPrefix) => {
			const leadingWhitespace = argumentPrefix.match(/^\s*/)?.[0] ?? "";
			const text = argumentPrefix.trimStart();
			const parts = text.split(/\s+/).filter(Boolean);

			if (parts.length <= 1 && !text.endsWith(" ")) {
				return ["status", "enable"].map((value) => ({ value: `${leadingWhitespace}${value}`, label: value }));
			}

			if (parts[0] === "enable") {
				const completedGroups = parts.slice(1, text.endsWith(" ") ? undefined : -1);
				const prefix = `${leadingWhitespace}enable${completedGroups.length > 0 ? ` ${completedGroups.join(" ")}` : ""}`;
				const selected = new Set(completedGroups);
				return Object.keys(state.config)
					.sort()
					.filter((groupName) => !selected.has(groupName))
					.map((groupName) => ({
						value: `${prefix} ${groupName}`,
						label: groupName,
					}));
			}

			return null;
		},
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const subcommand = parts[0] ?? "status";

			if (subcommand === "status") {
				ctx.ui.notify(formatStatus(state), "info");
				return;
			}

			if (subcommand !== "enable") {
				ctx.ui.notify("Usage: /tool status or /tool enable <group> [group...]", "warning");
				return;
			}

			const groupNames = parts.slice(1);
			if (groupNames.length === 0) {
				ctx.ui.notify("Usage: /tool enable <group> [group...]", "warning");
				return;
			}

			const unknownGroups = groupNames.filter((groupName) => !(groupName in state.config));
			if (unknownGroups.length > 0) {
				ctx.ui.notify(`Unknown tool gate group(s): ${unknownGroups.join(", ")}`, "warning");
				return;
			}

			const toolsToEnable = uniqueToolNames(groupNames.flatMap((groupName) => state.resolvedGroups.get(groupName) ?? []));
			for (const toolName of toolsToEnable) {
				state.enabledTools.add(toolName);
			}

			pi.setActiveTools(uniqueToolNames([...pi.getActiveTools(), ...toolsToEnable]));
			ctx.ui.notify(`Enabled tool gate group(s): ${groupNames.join(", ")}\nTools: ${toolsToEnable.join(", ")}`, "info");
		},
	});
}
