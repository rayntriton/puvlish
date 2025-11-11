/**
 * Git operations module for publishjs
 */

import { exists } from "@std/fs";
import { join } from "@std/path";
import { executeCommand, Err, Logger, Ok, PublishError, Result } from "./utils.ts";

export interface GitStatus {
  isRepo: boolean;
  hasRemote: boolean;
  currentBranch: string | null;
  isDirty: boolean;
}

export interface GitRemote {
  name: string;
  url: string;
}

/**
 * Check if Git is installed on the system
 */
export async function isGitInstalled(): Promise<boolean> {
  const result = await executeCommand("git", ["--version"]);
  return result.ok;
}

/**
 * Check if the current directory is a Git repository
 */
export async function isGitRepository(path: string = Deno.cwd()): Promise<boolean> {
  const gitDir = join(path, ".git");
  return await exists(gitDir);
}

/**
 * Initialize a new Git repository
 */
export async function initGitRepository(
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  logger?.info("Initializing Git repository...");

  const result = await executeCommand("git", ["init"], { cwd: path });

  if (!result.ok) {
    return Err(
      new PublishError(
        "Failed to initialize Git repository",
        "GIT_INIT_FAILED",
        result.error,
      ),
    );
  }

  logger?.success("Git repository initialized");
  return Ok(undefined);
}

/**
 * Get the current Git status
 */
export async function getGitStatus(
  path: string = Deno.cwd(),
): Promise<Result<GitStatus>> {
  const isRepo = await isGitRepository(path);

  if (!isRepo) {
    return Ok({
      isRepo: false,
      hasRemote: false,
      currentBranch: null,
      isDirty: false,
    });
  }

  // Get current branch
  const branchResult = await executeCommand("git", ["branch", "--show-current"], {
    cwd: path,
  });
  const currentBranch = branchResult.ok ? branchResult.value : null;

  // Check if there's a remote
  const remoteResult = await executeCommand("git", ["remote"], { cwd: path });
  const hasRemote = remoteResult.ok && remoteResult.value.length > 0;

  // Check if working directory is dirty
  const statusResult = await executeCommand("git", ["status", "--porcelain"], {
    cwd: path,
  });
  const isDirty = statusResult.ok && statusResult.value.length > 0;

  return Ok({
    isRepo: true,
    hasRemote,
    currentBranch,
    isDirty,
  });
}

/**
 * Get all local branches
 */
export async function getBranches(
  path: string = Deno.cwd(),
): Promise<Result<string[]>> {
  const result = await executeCommand("git", ["branch", "--format=%(refname:short)"], {
    cwd: path,
  });

  if (!result.ok) {
    return Err(
      new PublishError("Failed to get branches", "GIT_BRANCHES_FAILED", result.error),
    );
  }

  const branches = result.value
    .split("\n")
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  return Ok(branches);
}

/**
 * Get all tags
 */
export async function getTags(path: string = Deno.cwd()): Promise<Result<string[]>> {
  const result = await executeCommand("git", ["tag", "--list"], { cwd: path });

  if (!result.ok) {
    return Err(
      new PublishError("Failed to get tags", "GIT_TAGS_FAILED", result.error),
    );
  }

  const tags = result.value
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return Ok(tags);
}

/**
 * Get all remotes
 */
export async function getRemotes(
  path: string = Deno.cwd(),
): Promise<Result<GitRemote[]>> {
  const result = await executeCommand("git", ["remote", "-v"], { cwd: path });

  if (!result.ok) {
    return Err(
      new PublishError("Failed to get remotes", "GIT_REMOTES_FAILED", result.error),
    );
  }

  const remotes: Map<string, GitRemote> = new Map();

  result.value.split("\n").forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      const name = parts[0];
      const url = parts[1];
      if (!remotes.has(name)) {
        remotes.set(name, { name, url });
      }
    }
  });

  return Ok(Array.from(remotes.values()));
}

/**
 * Push to a remote repository
 */
export async function push(
  remote: string,
  ref: string,
  options?: { tags?: boolean; force?: boolean },
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  const args = ["push", remote, ref];

  if (options?.tags) {
    args.push("--tags");
  }

  if (options?.force) {
    args.push("--force");
  }

  logger?.info(`Pushing ${ref} to ${remote}...`);

  const result = await executeCommand("git", args, { cwd: path });

  if (!result.ok) {
    return Err(
      new PublishError(
        `Failed to push ${ref} to ${remote}`,
        "GIT_PUSH_FAILED",
        result.error,
      ),
    );
  }

  logger?.success(`Successfully pushed ${ref} to ${remote}`);
  return Ok(undefined);
}

/**
 * Create a new tag
 */
export async function createTag(
  tagName: string,
  message?: string,
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  const args = ["tag"];

  if (message) {
    args.push("-a", tagName, "-m", message);
  } else {
    args.push(tagName);
  }

  logger?.info(`Creating tag ${tagName}...`);

  const result = await executeCommand("git", args, { cwd: path });

  if (!result.ok) {
    return Err(
      new PublishError(
        `Failed to create tag ${tagName}`,
        "GIT_TAG_FAILED",
        result.error,
      ),
    );
  }

  logger?.success(`Tag ${tagName} created`);
  return Ok(undefined);
}

/**
 * Add a remote repository
 */
export async function addRemote(
  name: string,
  url: string,
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  logger?.info(`Adding remote ${name}: ${url}`);

  const result = await executeCommand("git", ["remote", "add", name, url], {
    cwd: path,
  });

  if (!result.ok) {
    return Err(
      new PublishError(
        `Failed to add remote ${name}`,
        "GIT_REMOTE_ADD_FAILED",
        result.error,
      ),
    );
  }

  logger?.success(`Remote ${name} added`);
  return Ok(undefined);
}

/**
 * Test if we can push to a remote (dry run)
 */
export async function canPush(
  remote: string = "origin",
  branch?: string,
  path: string = Deno.cwd(),
): Promise<boolean> {
  const args = ["push", "--dry-run", remote];

  if (branch) {
    args.push(branch);
  }

  const result = await executeCommand("git", args, { cwd: path });
  return result.ok;
}
