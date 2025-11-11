/**
 * Auto-commit module for handling uncommitted changes
 */

import { Confirm, Input } from "@cliffy/prompt";
import { executeCommand, Err, formatList, Logger, Ok, PublishError, Result } from "./utils.ts";

export interface GitChanges {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  total: number;
}

/**
 * Parse git status porcelain output
 */
function parseGitStatus(output: string): GitChanges {
  const changes: GitChanges = {
    modified: [],
    added: [],
    deleted: [],
    untracked: [],
    total: 0,
  };

  const lines = output.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    const status = line.substring(0, 2);
    const file = line.substring(3).trim();

    if (status.includes("M")) {
      changes.modified.push(file);
    } else if (status.includes("A")) {
      changes.added.push(file);
    } else if (status.includes("D")) {
      changes.deleted.push(file);
    } else if (status.includes("?")) {
      changes.untracked.push(file);
    }
  }

  changes.total = changes.modified.length +
    changes.added.length +
    changes.deleted.length +
    changes.untracked.length;

  return changes;
}

/**
 * Get current uncommitted changes
 */
async function getUncommittedChanges(
  path: string,
): Promise<Result<GitChanges>> {
  const result = await executeCommand("git", ["status", "--porcelain"], {
    cwd: path,
  });

  if (!result.ok) {
    return Err(
      new PublishError(
        "Failed to get git status",
        "GIT_STATUS_FAILED",
        result.error,
      ),
    );
  }

  const changes = parseGitStatus(result.value);
  return Ok(changes);
}

/**
 * Display changes summary
 */
function displayChanges(changes: GitChanges, logger: Logger): void {
  if (changes.modified.length > 0) {
    logger.info("Modified files:");
    console.log(formatList(changes.modified.slice(0, 10)));
    if (changes.modified.length > 10) {
      logger.info(`  ... and ${changes.modified.length - 10} more`);
    }
  }

  if (changes.added.length > 0) {
    logger.info("Added files:");
    console.log(formatList(changes.added.slice(0, 10)));
    if (changes.added.length > 10) {
      logger.info(`  ... and ${changes.added.length - 10} more`);
    }
  }

  if (changes.deleted.length > 0) {
    logger.info("Deleted files:");
    console.log(formatList(changes.deleted.slice(0, 10)));
    if (changes.deleted.length > 10) {
      logger.info(`  ... and ${changes.deleted.length - 10} more`);
    }
  }

  if (changes.untracked.length > 0) {
    logger.info("Untracked files:");
    console.log(formatList(changes.untracked.slice(0, 10)));
    if (changes.untracked.length > 10) {
      logger.info(`  ... and ${changes.untracked.length - 10} more`);
    }
  }

  logger.info(`\nTotal: ${changes.total} file(s) with changes`);
}

/**
 * Generate smart commit message based on changes
 */
function generateCommitMessage(changes: GitChanges): string {
  const parts: string[] = [];

  if (changes.added.length > 0) {
    if (changes.added.length === 1) {
      parts.push(`Add ${changes.added[0]}`);
    } else {
      parts.push(`Add ${changes.added.length} files`);
    }
  }

  if (changes.modified.length > 0) {
    if (changes.modified.length === 1 && parts.length === 0) {
      parts.push(`Update ${changes.modified[0]}`);
    } else if (parts.length === 0) {
      parts.push(`Update ${changes.modified.length} files`);
    }
  }

  if (changes.deleted.length > 0 && parts.length === 0) {
    if (changes.deleted.length === 1) {
      parts.push(`Delete ${changes.deleted[0]}`);
    } else {
      parts.push(`Delete ${changes.deleted.length} files`);
    }
  }

  if (parts.length === 0) {
    return "Update files";
  }

  return parts.join(", ");
}

/**
 * Prompt user for commit details
 */
async function promptCommitDetails(
  changes: GitChanges,
): Promise<Result<{ confirm: boolean; message: string }>> {
  try {
    const confirm = await Confirm.prompt({
      message: `Commit ${changes.total} file(s) before publishing?`,
      default: true,
    });

    if (!confirm) {
      return Ok({ confirm: false, message: "" });
    }

    const suggestedMessage = generateCommitMessage(changes);

    const useDefault = await Confirm.prompt({
      message: `Use commit message: "${suggestedMessage}"?`,
      default: true,
    });

    let message = suggestedMessage;

    if (!useDefault) {
      message = await Input.prompt({
        message: "Enter commit message:",
        default: suggestedMessage,
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return "Commit message cannot be empty";
          }
          return true;
        },
      });
    }

    return Ok({ confirm: true, message: message.trim() });
  } catch (error) {
    return Err(
      new PublishError(
        "Commit prompt cancelled",
        "COMMIT_PROMPT_CANCELLED",
        error,
      ),
    );
  }
}

/**
 * Execute git commit
 */
async function executeCommit(
  message: string,
  path: string,
  logger: Logger,
): Promise<Result<void>> {
  // Add all changes
  logger.info("Staging changes...");
  const addResult = await executeCommand("git", ["add", "."], { cwd: path });

  if (!addResult.ok) {
    return Err(
      new PublishError(
        "Failed to stage changes",
        "GIT_ADD_FAILED",
        addResult.error,
      ),
    );
  }

  // Commit
  logger.info("Creating commit...");
  const commitResult = await executeCommand(
    "git",
    ["commit", "-m", message],
    { cwd: path },
  );

  if (!commitResult.ok) {
    return Err(
      new PublishError(
        "Failed to create commit",
        "GIT_COMMIT_FAILED",
        commitResult.error,
      ),
    );
  }

  logger.success(`Commit created: "${message}"`);
  return Ok(undefined);
}

/**
 * Check if working directory has uncommitted changes
 */
export async function hasUncommittedChanges(
  path: string = Deno.cwd(),
): Promise<boolean> {
  const changesResult = await getUncommittedChanges(path);
  if (!changesResult.ok) return false;

  return changesResult.value.total > 0;
}

/**
 * Automatically commit uncommitted changes with user confirmation
 */
export async function autoCommitChanges(
  path: string = Deno.cwd(),
  logger: Logger,
): Promise<Result<void>> {
  // Get changes
  const changesResult = await getUncommittedChanges(path);
  if (!changesResult.ok) return Err(changesResult.error);

  const changes = changesResult.value;

  if (changes.total === 0) {
    logger.debug("No uncommitted changes");
    return Ok(undefined);
  }

  logger.section("Uncommitted Changes Detected");

  // Display changes
  displayChanges(changes, logger);

  console.log(); // Empty line

  // Prompt for commit
  const detailsResult = await promptCommitDetails(changes);
  if (!detailsResult.ok) return Err(detailsResult.error);

  const { confirm, message } = detailsResult.value;

  if (!confirm) {
    return Err(
      new PublishError(
        "User declined to commit changes",
        "COMMIT_DECLINED",
      ),
    );
  }

  // Execute commit
  const commitResult = await executeCommit(message, path, logger);
  if (!commitResult.ok) return Err(commitResult.error);

  return Ok(undefined);
}
