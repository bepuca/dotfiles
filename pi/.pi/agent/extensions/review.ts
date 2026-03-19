/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * Portions of this file are adapted from the Code Review extension in
 * https://github.com/mitsuhiko/agent-stuff (Apache-2.0), modified and
 * simplified for this configuration.
 */

import type { ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import path from "node:path";
import { promises as fs } from "node:fs";

let reviewOriginId: string | undefined;
let endReviewInProgress = false;

const REVIEW_STATE_TYPE = "review-session";
const REVIEW_ANCHOR_TYPE = "review-anchor";

type ReviewSessionState = {
	active: boolean;
	originId?: string;
};

const REVIEW_PROMPT = `# Review Task

Review the current branch against the main branch.

## What to inspect
- Use the supplied merge base and compare the branch against main.
- Also inspect local staged, unstaged, and untracked changes so the review covers the full current working tree.
- Use read-only commands only. Do not modify files while reviewing.

## Process
1. Start by understanding the overall change.
2. Produce a concise PR description.
3. Then review the code like a principal engineer.
4. Favor simple over smart, readable over clever, and extensible over tightly coupled.
5. Only flag concrete issues introduced by the change.

## Output format

## PR Description
### Title
- One short title

### Summary
- What changed
- Why it changed

### Risks
- Key risk areas
- Or "- (none)"

### Testing
- Observed or expected validation
- Or "- not verified"

## Verdict
- correct
- or needs attention

## Findings
For each finding:
- Include a priority tag: [P1], [P2], or [P3]
- Include a precise location: \`path/to/file:line\`
- Briefly explain why it matters
- Briefly state what should change

If there are no actionable findings, explicitly say the code looks good.

## Human Reviewer Callouts (Non-Blocking)
Include only applicable callouts:
- **This change adds a database migration:** <details>
- **This change introduces a new dependency:** <details>
- **This change changes a dependency (or the lockfile):** <details>
- **This change modifies auth/permission behavior:** <details>
- **This change introduces backwards-incompatible public schema/API/contract changes:** <details>
- **This change includes irreversible or destructive operations:** <details>

If none apply, write "- (none)".`;

const REVIEW_SUMMARY_PROMPT = `We are leaving a code-review branch and returning to the main coding branch.
Create a structured handoff that preserves the review outcome so it can be acted on later.

Required sections, in order:

## Review Scope
- What was reviewed against main
- Which files or areas were involved

## PR Description
- Title
- Summary
- Risks
- Testing

## Verdict
- correct
- or needs attention

## Findings
For every actionable finding, include:
- Priority tag ([P1]..[P3]) and short title
- File location (\`path/to/file:line\`)
- Why it matters
- What should change

If there were no actionable findings, say so explicitly.

## Human Reviewer Callouts (Non-Blocking)
Preserve any applicable callouts.
If none apply, write "- (none)".

## Suggested Next Steps
- Ordered checklist for the main branch
- Or "- none" if nothing needs to be done.

Preserve exact file paths, function names, and concrete technical details where available.`;

function setReviewWidget(ctx: ExtensionContext, active: boolean) {
	if (!ctx.hasUI) return;
	if (!active) {
		ctx.ui.setWidget("review", undefined);
		return;
	}

	ctx.ui.setWidget("review", ["Review session active, return with /end-review"]);
}

function getReviewState(ctx: ExtensionContext): ReviewSessionState | undefined {
	let state: ReviewSessionState | undefined;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === REVIEW_STATE_TYPE) {
			state = entry.data as ReviewSessionState | undefined;
		}
	}
	return state;
}

function applyReviewState(ctx: ExtensionContext) {
	const state = getReviewState(ctx);
	if (state?.active && state.originId) {
		reviewOriginId = state.originId;
		setReviewWidget(ctx, true);
		return;
	}

	reviewOriginId = undefined;
	setReviewWidget(ctx, false);
}

async function loadProjectReviewGuidelines(cwd: string): Promise<string | null> {
	let currentDir = path.resolve(cwd);

	while (true) {
		const piDir = path.join(currentDir, ".pi");
		const guidelinesPath = path.join(currentDir, "REVIEW_GUIDELINES.md");

		const piStats = await fs.stat(piDir).catch(() => null);
		if (piStats?.isDirectory()) {
			const guidelineStats = await fs.stat(guidelinesPath).catch(() => null);
			if (!guidelineStats?.isFile()) {
				return null;
			}

			const content = await fs.readFile(guidelinesPath, "utf8").catch(() => "");
			const trimmed = content.trim();
			return trimmed || null;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			return null;
		}
		currentDir = parentDir;
	}
}

async function getMainBaseRef(pi: ExtensionAPI): Promise<string | null> {
	for (const ref of ["origin/main", "main"]) {
		const { code } = await pi.exec("git", ["rev-parse", "--verify", ref]);
		if (code === 0) {
			return ref;
		}
	}

	return null;
}

async function getMergeBase(pi: ExtensionAPI, baseRef: string): Promise<string | null> {
	const { stdout, code } = await pi.exec("git", ["merge-base", "HEAD", baseRef]);
	if (code !== 0) {
		return null;
	}

	const mergeBase = stdout.trim();
	return mergeBase || null;
}

async function buildReviewPrompt(pi: ExtensionAPI, cwd: string): Promise<{ prompt: string; hint: string }> {
	const baseRef = await getMainBaseRef(pi);
	if (!baseRef) {
		throw new Error("Could not find origin/main or main in this repository");
	}

	const mergeBase = await getMergeBase(pi, baseRef);
	if (!mergeBase) {
		throw new Error(`Could not determine merge base with ${baseRef}`);
	}

	let prompt = `${REVIEW_PROMPT}

## Review Context
- Base branch: ${baseRef}
- Merge base: ${mergeBase}
- Start with: \`git diff ${mergeBase}\`
- Also use: \`git status --short\` and \`git ls-files --others --exclude-standard\`
- Read files directly before making claims.
- Keep bash usage strictly read-only.`;

	const projectGuidelines = await loadProjectReviewGuidelines(cwd);
	if (projectGuidelines) {
		prompt += `

## Project Review Guidelines

${projectGuidelines}`;
	}

	return {
		prompt,
		hint: `changes against ${baseRef}`,
	};
}

function getActiveReviewOrigin(ctx: ExtensionContext): string | undefined {
	if (reviewOriginId) {
		return reviewOriginId;
	}

	const state = getReviewState(ctx);
	if (state?.active && state.originId) {
		reviewOriginId = state.originId;
		return reviewOriginId;
	}

	return undefined;
}

export default function reviewExtension(pi: ExtensionAPI) {
	function clearReviewState(ctx: ExtensionContext) {
		reviewOriginId = undefined;
		setReviewWidget(ctx, false);
		pi.appendEntry(REVIEW_STATE_TYPE, { active: false });
	}

	pi.on("session_start", (_event, ctx) => {
		applyReviewState(ctx);
	});

	pi.on("session_switch", (_event, ctx) => {
		applyReviewState(ctx);
	});

	pi.on("session_tree", (_event, ctx) => {
		applyReviewState(ctx);
	});

	async function executeReview(ctx: ExtensionCommandContext, useFreshSession: boolean): Promise<boolean> {
		if (reviewOriginId) {
			ctx.ui.notify("Already in a review. Use /end-review to finish first.", "warning");
			return false;
		}

		if (useFreshSession) {
			let originId = ctx.sessionManager.getLeafId() ?? undefined;
			if (!originId) {
				pi.appendEntry(REVIEW_ANCHOR_TYPE, { createdAt: new Date().toISOString() });
				originId = ctx.sessionManager.getLeafId() ?? undefined;
			}

			if (!originId) {
				ctx.ui.notify("Failed to determine review origin.", "error");
				return false;
			}

			const lockedOriginId = originId;
			const firstUserMessage = ctx.sessionManager
				.getEntries()
				.find((entry) => entry.type === "message" && entry.message.role === "user");

			if (firstUserMessage) {
				try {
					const result = await ctx.navigateTree(firstUserMessage.id, {
						summarize: false,
						label: "code-review",
					});
					if (result.cancelled) {
						reviewOriginId = undefined;
						return false;
					}
				} catch (error) {
					reviewOriginId = undefined;
					ctx.ui.notify(`Failed to start review: ${error instanceof Error ? error.message : String(error)}`, "error");
					return false;
				}

				ctx.ui.setEditorText("");
			}

			reviewOriginId = lockedOriginId;
			setReviewWidget(ctx, true);
			pi.appendEntry(REVIEW_STATE_TYPE, { active: true, originId: lockedOriginId });
		}

		let prompt: string;
		let hint: string;
		try {
			const reviewPrompt = await buildReviewPrompt(pi, ctx.cwd);
			prompt = reviewPrompt.prompt;
			hint = reviewPrompt.hint;
		} catch (error) {
			ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			if (useFreshSession) {
				const originId = reviewOriginId;
				if (originId) {
					try {
						await ctx.navigateTree(originId, { summarize: false });
					} catch {
						// ignore navigation failure while unwinding setup
					}
				}
				clearReviewState(ctx);
			}
			return false;
		}

		ctx.ui.notify(`Starting review: ${hint}${useFreshSession ? " (fresh session)" : ""}`, "info");
		pi.sendUserMessage(prompt);
		return true;
	}

	pi.registerCommand("review", {
		description: "Review current changes against main",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("Review requires interactive mode", "error");
				return;
			}

			if (reviewOriginId) {
				ctx.ui.notify("Already in a review. Use /end-review to finish first.", "warning");
				return;
			}

			const { code } = await pi.exec("git", ["rev-parse", "--git-dir"]);
			if (code !== 0) {
				ctx.ui.notify("Not a git repository", "error");
				return;
			}

			const messageCount = ctx.sessionManager
				.getEntries()
				.filter((entry) => entry.type === "message").length;

			let useFreshSession = messageCount === 0;
			if (messageCount > 0) {
				const choice = await ctx.ui.select("Start review in:", ["Empty branch", "Current session"]);
				if (!choice) {
					ctx.ui.notify("Review cancelled", "info");
					return;
				}
				useFreshSession = choice === "Empty branch";
			}

			await executeReview(ctx, useFreshSession);
		},
	});

	async function navigateWithSummary(
		ctx: ExtensionCommandContext,
		originId: string,
	): Promise<{ cancelled: boolean; error?: string }> {
		if (ctx.hasUI) {
			ctx.ui.setStatus("review", "Returning and summarizing review branch...");
		}

		try {
			const result = await ctx.navigateTree(originId, {
				summarize: true,
				customInstructions: REVIEW_SUMMARY_PROMPT,
				replaceInstructions: true,
			});
			return { cancelled: result.cancelled };
		} catch (error) {
			return { cancelled: false, error: error instanceof Error ? error.message : String(error) };
		} finally {
			if (ctx.hasUI) {
				ctx.ui.setStatus("review", undefined);
			}
		}
	}

	pi.registerCommand("end-review", {
		description: "Return from a review branch",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("End-review requires interactive mode", "error");
				return;
			}

			if (endReviewInProgress) {
				ctx.ui.notify("/end-review is already running", "info");
				return;
			}

			const originId = getActiveReviewOrigin(ctx);
			if (!originId) {
				ctx.ui.notify("Not in a review branch", "info");
				return;
			}

			endReviewInProgress = true;
			try {
				const choice = await ctx.ui.select("Finish review:", ["Return and summarize", "Return only"]);
				if (!choice) {
					ctx.ui.notify("Cancelled. Use /end-review to try again.", "info");
					return;
				}

				if (choice === "Return only") {
					try {
						const result = await ctx.navigateTree(originId, { summarize: false });
						if (result.cancelled) {
							ctx.ui.notify("Navigation cancelled. Use /end-review to try again.", "info");
							return;
						}
					} catch (error) {
						ctx.ui.notify(`Failed to return: ${error instanceof Error ? error.message : String(error)}`, "error");
						return;
					}

					clearReviewState(ctx);
					ctx.ui.notify("Review complete! Returned to original position.", "info");
					return;
				}

				const summaryResult = await navigateWithSummary(ctx, originId);
				if (summaryResult.error) {
					ctx.ui.notify(`Summarization failed: ${summaryResult.error}`, "error");
					return;
				}

				if (summaryResult.cancelled) {
					ctx.ui.notify("Navigation cancelled. Use /end-review to try again.", "info");
					return;
				}

				clearReviewState(ctx);
				ctx.ui.notify("Review complete! Returned and summarized.", "info");
			} finally {
				endReviewInProgress = false;
			}
		},
	});
}
