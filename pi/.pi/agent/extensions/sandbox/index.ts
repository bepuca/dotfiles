/**
 * Sandbox Extension - OS-level sandboxing for bash commands
 *
 * Uses @anthropic-ai/sandbox-runtime to enforce filesystem and network
 * restrictions on bash commands at the OS level (sandbox-exec on macOS,
 * bubblewrap on Linux).
 *
 * Config files (merged, project takes precedence):
 * - ~/.pi/agent/sandbox.json (global)
 * - <cwd>/.pi/sandbox.json (project-local)
 *
 * Example .pi/sandbox.json:
 * ```json
 * {
 *   "enabled": true,
 *   "network": {
 *     "allowedDomains": ["github.com", "*.github.com"],
 *     "deniedDomains": []
 *   },
 *   "filesystem": {
 *     "denyRead": ["~/.ssh", "~/.aws"],
 *     "allowWrite": [".", "/tmp"],
 *     "denyWrite": [".env"]
 *   }
 * }
 * ```
 *
 * Usage:
 * - `pi -e ./sandbox` - sandbox enabled with default/config settings
 * - `pi -e ./sandbox --no-sandbox` - disable sandboxing
 * - `/sandbox` - show current sandbox configuration
 *
 * Setup:
 * 1. Copy sandbox/ directory to ~/.pi/agent/extensions/
 * 2. Run `npm install` in ~/.pi/agent/extensions/sandbox/
 *
 * Linux also requires: bubblewrap, socat, ripgrep
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type SandboxNetworkConfig = {
	allowedDomains?: string[];
	deniedDomains?: string[];
};

type SandboxRuntimeConfig = {
	network?: SandboxNetworkConfig;
	filesystem?: {
		denyRead?: string[];
		allowWrite?: string[];
		denyWrite?: string[];
	};
	ignoreViolations?: Record<string, string[]>;
	enableWeakerNestedSandbox?: boolean;
};

type SandboxManagerType = {
	initialize(config: SandboxRuntimeConfig): Promise<void>;
	wrapWithSandbox(command: string): Promise<string>;
	reset(): Promise<void>;
};

type BashOperations = {
	exec(
		command: string,
		cwd: string,
		options: {
			onData?: (data: Buffer) => void;
			signal?: AbortSignal;
			timeout?: number;
		},
	): Promise<{ exitCode: number | null }>;
};

type CreateBashTool = (cwd: string, options?: { operations?: BashOperations }) => {
	name: string;
	label?: string;
	execute: (id: string, params: unknown, signal?: AbortSignal, onUpdate?: unknown, ctx?: unknown) => Promise<unknown>;
	[key: string]: unknown;
};

interface SandboxConfig extends Omit<SandboxRuntimeConfig, "network"> {
	enabled?: boolean;
	network?: SandboxNetworkConfig | null;
}

const DEFAULT_CONFIG: SandboxConfig = {
	enabled: true,
	network: {
		allowedDomains: [
			"npmjs.org",
			"*.npmjs.org",
			"registry.npmjs.org",
			"registry.yarnpkg.com",
			"pypi.org",
			"*.pypi.org",
			"github.com",
			"*.github.com",
			"api.github.com",
			"raw.githubusercontent.com",
		],
		deniedDomains: [],
	},
	filesystem: {
		denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
		allowWrite: [".", "/tmp"],
		denyWrite: [".env", ".env.*", "*.pem", "*.key"],
	},
};

function loadConfig(cwd: string): SandboxConfig {
	const projectConfigPath = join(cwd, ".pi", "sandbox.json");
	const globalConfigPath = join(homedir(), ".pi", "agent", "sandbox.json");

	let globalConfig: Partial<SandboxConfig> = {};
	let projectConfig: Partial<SandboxConfig> = {};

	if (existsSync(globalConfigPath)) {
		try {
			globalConfig = JSON.parse(readFileSync(globalConfigPath, "utf-8"));
		} catch (e) {
			console.error(`Warning: Could not parse ${globalConfigPath}: ${e}`);
		}
	}

	if (existsSync(projectConfigPath)) {
		try {
			projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf-8"));
		} catch (e) {
			console.error(`Warning: Could not parse ${projectConfigPath}: ${e}`);
		}
	}

	return deepMerge(deepMerge(DEFAULT_CONFIG, globalConfig), projectConfig);
}

function deepMerge(base: SandboxConfig, overrides: Partial<SandboxConfig>): SandboxConfig {
	const result: SandboxConfig = { ...base };

	if (overrides.enabled !== undefined) result.enabled = overrides.enabled;
	if (overrides.network === null) {
		result.network = null;
	} else if (overrides.network) {
		result.network = { ...(base.network ?? DEFAULT_CONFIG.network), ...overrides.network };
	}
	if (overrides.filesystem) {
		result.filesystem = { ...base.filesystem, ...overrides.filesystem };
	}

	const extOverrides = overrides as {
		ignoreViolations?: Record<string, string[]>;
		enableWeakerNestedSandbox?: boolean;
	};
	const extResult = result as { ignoreViolations?: Record<string, string[]>; enableWeakerNestedSandbox?: boolean };

	if (extOverrides.ignoreViolations) {
		extResult.ignoreViolations = extOverrides.ignoreViolations;
	}
	if (extOverrides.enableWeakerNestedSandbox !== undefined) {
		extResult.enableWeakerNestedSandbox = extOverrides.enableWeakerNestedSandbox;
	}

	return result;
}

function createSandboxedBashOps(sandboxManager: SandboxManagerType): BashOperations {
	return {
		async exec(command, cwd, { onData, signal, timeout }) {
			if (!existsSync(cwd)) {
				throw new Error(`Working directory does not exist: ${cwd}`);
			}

			const wrappedCommand = await sandboxManager.wrapWithSandbox(command);

			return new Promise((resolve, reject) => {
				const child = spawn("bash", ["-c", wrappedCommand], {
					cwd,
					detached: true,
					stdio: ["ignore", "pipe", "pipe"],
				});

				let timedOut = false;
				let timeoutHandle: NodeJS.Timeout | undefined;

				if (timeout !== undefined && timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						if (child.pid) {
							try {
								process.kill(-child.pid, "SIGKILL");
							} catch {
								child.kill("SIGKILL");
							}
						}
					}, timeout * 1000);
				}

				child.stdout?.on("data", onData);
				child.stderr?.on("data", onData);

				child.on("error", (err) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					reject(err);
				});

				const onAbort = () => {
					if (child.pid) {
						try {
							process.kill(-child.pid, "SIGKILL");
						} catch {
							child.kill("SIGKILL");
						}
					}
				};

				signal?.addEventListener("abort", onAbort, { once: true });

				child.on("close", (code) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					signal?.removeEventListener("abort", onAbort);

					if (signal?.aborted) {
						reject(new Error("aborted"));
					} else if (timedOut) {
						reject(new Error(`timeout:${timeout}`));
					} else {
						resolve({ exitCode: code });
					}
				});
			});
		},
	};
}

function commandExists(command: string): boolean {
	const result = spawnSync("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
	return result.status === 0;
}

function getPlatformUnavailableReason(): string | undefined {
	const platform = process.platform;
	if (platform !== "darwin" && platform !== "linux") {
		return `sandboxing is not supported on ${platform}`;
	}

	if (platform === "darwin" && !commandExists("sandbox-exec")) {
		return "sandbox-exec is not available";
	}

	if (platform === "linux") {
		const missing = ["bwrap", "socat", "rg"].filter((command) => !commandExists(command));
		if (missing.length > 0) {
			return `missing required command(s): ${missing.join(", ")}`;
		}
	}

	return undefined;
}

async function loadCreateBashTool(): Promise<CreateBashTool> {
	for (const packageName of ["@mariozechner/pi-coding-agent", "@earendil-works/pi-coding-agent"]) {
		try {
			const module = (await import(packageName)) as { createBashTool?: CreateBashTool };
			if (module.createBashTool) {
				return module.createBashTool;
			}
		} catch {
			// Try the next package name.
		}
	}

	throw new Error("could not import createBashTool from pi-coding-agent");
}

async function loadSandboxManager(): Promise<SandboxManagerType> {
	const module = (await import("@anthropic-ai/sandbox-runtime")) as { SandboxManager?: SandboxManagerType };
	if (!module.SandboxManager) {
		throw new Error("@anthropic-ai/sandbox-runtime did not export SandboxManager");
	}
	return module.SandboxManager;
}

export default async function (pi: ExtensionAPI) {
	let createBashTool: CreateBashTool;
	try {
		createBashTool = await loadCreateBashTool();
	} catch (error) {
		pi.on("session_start", (_event, ctx) => {
			ctx.ui.notify(`Sandbox extension disabled: ${error instanceof Error ? error.message : String(error)}`, "warning");
		});
		return;
	}

	pi.registerFlag("no-sandbox", {
		description: "Disable OS-level sandboxing for bash commands",
		type: "boolean",
		default: false,
	});

	const localCwd = process.cwd();
	const localBash = createBashTool(localCwd);

	let sandboxManager: SandboxManagerType | undefined;
	let sandboxEnabled = false;
	let sandboxInitialized = false;
	let unavailableReason: string | undefined;

	pi.registerTool({
		...localBash,
		label: "bash (sandboxed)",
		async execute(id, params, signal, onUpdate, _ctx) {
			if (!sandboxEnabled || !sandboxInitialized || !sandboxManager) {
				return localBash.execute(id, params, signal, onUpdate);
			}

			const sandboxedBash = createBashTool(localCwd, {
				operations: createSandboxedBashOps(sandboxManager),
			});
			return sandboxedBash.execute(id, params, signal, onUpdate);
		},
	});

	pi.on("user_bash", () => {
		if (!sandboxEnabled || !sandboxInitialized || !sandboxManager) return;
		return { operations: createSandboxedBashOps(sandboxManager) };
	});

	pi.on("session_start", async (_event, ctx) => {
		const noSandbox = pi.getFlag("no-sandbox") as boolean;

		if (noSandbox) {
			sandboxEnabled = false;
			ctx.ui.notify("Sandbox disabled via --no-sandbox", "warning");
			return;
		}

		const config = loadConfig(ctx.cwd);

		if (!config.enabled) {
			sandboxEnabled = false;
			ctx.ui.notify("Sandbox disabled via config", "info");
			return;
		}

		unavailableReason = getPlatformUnavailableReason();
		if (unavailableReason) {
			sandboxEnabled = false;
			ctx.ui.notify(`Sandbox extension disabled: ${unavailableReason}`, "warning");
			return;
		}

		try {
			sandboxManager = await loadSandboxManager();

			const configExt = config as unknown as {
				ignoreViolations?: Record<string, string[]>;
				enableWeakerNestedSandbox?: boolean;
			};
			const initConfig = {
				filesystem: config.filesystem,
				ignoreViolations: configExt.ignoreViolations,
				enableWeakerNestedSandbox: configExt.enableWeakerNestedSandbox,
				// sandbox-runtime currently expects config.network to exist during initialize(),
				// even when we want wrapWithSandbox() to leave network unrestricted.
				// An empty object keeps initialize() happy while preserving unrestricted
				// network because allowedDomains stays undefined.
				network: config.network ?? {},
			};

			await sandboxManager.initialize(initConfig as SandboxRuntimeConfig);

			sandboxEnabled = true;
			sandboxInitialized = true;

			const networkStatus =
				config.network === null || config.network === undefined
					? "network unrestricted"
					: `${config.network.allowedDomains?.length ?? 0} domains`;
			const writeCount = config.filesystem?.allowWrite?.length ?? 0;
			ctx.ui.setStatus(
				"sandbox",
				ctx.ui.theme.fg("accent", `🔒 Sandbox: ${networkStatus}, ${writeCount} write paths`),
			);
			ctx.ui.notify("Sandbox initialized", "info");
		} catch (err) {
			sandboxEnabled = false;
			sandboxInitialized = false;
			ctx.ui.notify(`Sandbox extension disabled: ${err instanceof Error ? err.message : String(err)}`, "warning");
		}
	});

	pi.on("session_shutdown", async () => {
		if (sandboxInitialized && sandboxManager) {
			try {
				await sandboxManager.reset();
			} catch {
				// Ignore cleanup errors
			}
		}
	});

	pi.registerCommand("sandbox", {
		description: "Show sandbox configuration",
		handler: async (_args, ctx) => {
			if (!sandboxEnabled) {
				ctx.ui.notify(`Sandbox is disabled${unavailableReason ? `: ${unavailableReason}` : ""}`, "info");
				return;
			}

			const config = loadConfig(ctx.cwd);
			const lines = [
				"Sandbox Configuration:",
				"",
				"Network:",
				...(config.network === null || config.network === undefined
					? ["  Disabled: unrestricted"]
					: [
						`  Allowed: ${config.network.allowedDomains?.join(", ") || "(none)"}`,
						`  Denied: ${config.network.deniedDomains?.join(", ") || "(none)"}`,
					]),
				"",
				"Filesystem:",
				`  Deny Read: ${config.filesystem?.denyRead?.join(", ") || "(none)"}`,
				`  Allow Write: ${config.filesystem?.allowWrite?.join(", ") || "(none)"}`,
				`  Deny Write: ${config.filesystem?.denyWrite?.join(", ") || "(none)"}`,
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
