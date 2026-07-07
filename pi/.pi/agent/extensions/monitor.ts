/**
 * Monitor Extension
 *
 * Starts labelled background processes and forwards stdout lines as user follow-ups.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { Type } from "typebox";

const MONITOR_START_PARAMS = Type.Object({
	label: Type.String({ description: "Unique label for this monitor" }),
	command: Type.String({ description: "Command to run" }),
	args: Type.Optional(Type.Array(Type.String(), { description: "Command arguments" })),
});

const MONITOR_STOP_PARAMS = Type.Object({
	label: Type.Optional(Type.String({ description: "Monitor label to stop. Omit to stop all monitors." })),
});

const MONITOR_LIST_PARAMS = Type.Object({});

type MonitorInfo = {
	label: string;
	command: string;
	args: string[];
	startedAt: number;
};

type Monitor = MonitorInfo & {
	child: ChildProcessWithoutNullStreams;
	stopping: boolean;
};

function validateLabel(label: string): string {
	const trimmed = label.trim();
	if (!trimmed) throw new Error("label must not be empty");
	return trimmed;
}

function validateCommand(command: string): string {
	const trimmed = command.trim();
	if (!trimmed) throw new Error("command must not be empty");
	return trimmed;
}

function monitorDetails(monitors: Iterable<Monitor>): { monitors: MonitorInfo[] } {
	return {
		monitors: Array.from(monitors, ({ label, command, args, startedAt }) => ({
			label,
			command,
			args,
			startedAt,
		})),
	};
}

function monitorEventMessage(label: string, line: string): string {
	return `Monitor event from "${label}":

\`\`\`
${line}
\`\`\`

React to this event according to the active instructions.`;
}

function killProcessGroup(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals) {
	if (!child.pid) return;

	try {
		process.kill(-child.pid, signal);
	} catch {
		child.kill(signal);
	}
}

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);

	return new Promise((resolve) => {
		const timeout = setTimeout(() => {
			child.off("exit", onExit);
			resolve(false);
		}, timeoutMs);

		function onExit() {
			clearTimeout(timeout);
			resolve(true);
		}

		child.once("exit", onExit);
	});
}

async function terminateMonitor(monitor: Monitor) {
	monitor.stopping = true;
	killProcessGroup(monitor.child, "SIGTERM");
	if (await waitForExit(monitor.child, 5000)) return;
	killProcessGroup(monitor.child, "SIGKILL");
	await waitForExit(monitor.child, 1000);
}

export default function monitorExtension(pi: ExtensionAPI) {
	const monitors = new Map<string, Monitor>();

	function stopMonitor(label: string): boolean {
		const monitor = monitors.get(label);
		if (!monitor) return false;

		monitor.stopping = true;
		killProcessGroup(monitor.child, "SIGTERM");
		setTimeout(() => {
			if (monitors.has(label)) {
				killProcessGroup(monitor.child, "SIGKILL");
			}
		}, 5000).unref();
		return true;
	}

	function stopAllMonitors(): string[] {
		const labels = Array.from(monitors.keys());
		for (const label of labels) {
			stopMonitor(label);
		}
		return labels;
	}

	pi.registerTool({
		name: "monitor_start",
		label: "Monitor Start",
		description: "Start a labelled background process and forward each stdout line as a follow-up user message.",
		promptSnippet: "Start a labelled background monitor process",
		promptGuidelines: [
			"Use monitor_start only when the user wants a background command monitored over time.",
			"Use monitor_stop to stop monitors that are no longer needed.",
		],
		parameters: MONITOR_START_PARAMS,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const label = validateLabel(params.label);
			const command = validateCommand(params.command);
			const args = params.args ?? [];

			if (monitors.has(label)) {
				return {
					content: [{ type: "text", text: `Monitor "${label}" already exists.` }],
					details: { error: "duplicate_label", label },
					isError: true,
				};
			}

			const child = spawn(command, args, {
				cwd: ctx.cwd,
				detached: true,
				stdio: ["ignore", "pipe", "pipe"],
			});

			const monitor: Monitor = {
				label,
				command,
				args,
				startedAt: Date.now(),
				child,
				stopping: false,
			};

			monitors.set(label, monitor);

			const stdout = createInterface({ input: child.stdout });
			stdout.on("line", (line) => {
				const message = monitorEventMessage(label, line);
				if (ctx.isIdle()) {
					pi.sendUserMessage(message);
				} else {
					pi.sendUserMessage(message, { deliverAs: "followUp" });
				}
			});

			const stderr = createInterface({ input: child.stderr });
			stderr.on("line", (line) => {
				ctx.ui.notify(`Monitor "${label}" stderr: ${line}`, "warning");
			});

			child.on("error", (error) => {
				monitors.delete(label);
				ctx.ui.notify(`Monitor "${label}" failed: ${error.message}`, "error");
			});

			child.on("exit", (code, signal) => {
				monitors.delete(label);
				stdout.close();
				stderr.close();
				const suffix = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
				ctx.ui.notify(`Monitor "${label}" ${monitor.stopping ? "stopped" : "exited"} (${suffix})`, "info");
			});

			return {
				content: [{ type: "text", text: `Started monitor "${label}".` }],
				details: { monitor: { label, command, args, startedAt: monitor.startedAt } },
			};
		},
	});

	pi.registerTool({
		name: "monitor_stop",
		label: "Monitor Stop",
		description: "Stop one monitor by label, or stop all monitors when no label is provided.",
		promptSnippet: "Stop one or all active background monitors",
		parameters: MONITOR_STOP_PARAMS,
		async execute(_toolCallId, params) {
			const label = params.label?.trim();
			if (label) {
				const stopped = stopMonitor(label);
				return {
					content: [{ type: "text", text: stopped ? `Stopping monitor "${label}".` : `Monitor "${label}" is not active.` }],
					details: { stopped: stopped ? [label] : [], missing: stopped ? [] : [label] },
				};
			}

			const stopped = stopAllMonitors();
			return {
				content: [{ type: "text", text: stopped.length === 0 ? "No active monitors." : `Stopping monitors: ${stopped.join(", ")}.` }],
				details: { stopped },
			};
		},
	});

	pi.registerTool({
		name: "monitor_list",
		label: "Monitor List",
		description: "List active background monitors.",
		promptSnippet: "List active background monitors",
		parameters: MONITOR_LIST_PARAMS,
		async execute() {
			const details = monitorDetails(monitors.values());
			return {
				content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
				details,
			};
		},
	});

	pi.registerCommand("monitor", {
		description: "Manage monitors manually: /monitor list, /monitor stop [label]",
		handler: async (args, ctx) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const subcommand = parts[0] ?? "list";

			if (subcommand === "list") {
				ctx.ui.notify(JSON.stringify(monitorDetails(monitors.values()), null, 2), "info");
				return;
			}

			if (subcommand === "stop") {
				const label = parts.slice(1).join(" ").trim();
				if (label) {
					ctx.ui.notify(stopMonitor(label) ? `Stopping monitor "${label}".` : `Monitor "${label}" is not active.`, "info");
					return;
				}

				const stopped = stopAllMonitors();
				ctx.ui.notify(stopped.length === 0 ? "No active monitors." : `Stopping monitors: ${stopped.join(", ")}.`, "info");
				return;
			}

			ctx.ui.notify("Usage: /monitor list or /monitor stop [label]", "warning");
		},
	});

	pi.on("session_shutdown", async () => {
		const activeMonitors = Array.from(monitors.values());
		await Promise.all(activeMonitors.map((monitor) => terminateMonitor(monitor)));
		monitors.clear();
	});
}
