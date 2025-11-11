/**
 * Remote repository management module for publishjs
 */

import { GitRemote, getRemotes } from "./git.ts";
import { Err, Logger, Ok, PublishError, Result, validateUrl } from "./utils.ts";

export enum RemotePlatform {
  GITHUB = "github",
  GITLAB = "gitlab",
  BITBUCKET = "bitbucket",
  OTHER = "other",
}

export interface RemoteInfo {
  name: string;
  url: string;
  platform: RemotePlatform;
  owner?: string;
  repo?: string;
}

/**
 * Detect the platform from a Git URL
 */
export function detectPlatform(url: string): RemotePlatform {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes("github.com")) {
    return RemotePlatform.GITHUB;
  } else if (lowerUrl.includes("gitlab.com")) {
    return RemotePlatform.GITLAB;
  } else if (lowerUrl.includes("bitbucket.org")) {
    return RemotePlatform.BITBUCKET;
  }

  return RemotePlatform.OTHER;
}

/**
 * Parse a Git URL to extract owner and repository name
 */
export function parseGitUrl(url: string): Result<{ owner: string; repo: string }> {
  try {
    // Handle SSH URLs: git@github.com:owner/repo.git
    const sshMatch = url.match(/git@[^:]+:([^/]+)\/(.+?)(?:\.git)?$/);
    if (sshMatch) {
      return Ok({
        owner: sshMatch[1],
        repo: sshMatch[2],
      });
    }

    // Handle HTTPS URLs: https://github.com/owner/repo.git
    const httpsMatch = url.match(/https?:\/\/[^/]+\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
      return Ok({
        owner: httpsMatch[1],
        repo: httpsMatch[2],
      });
    }

    return Err(new PublishError("Unable to parse Git URL", "INVALID_GIT_URL"));
  } catch (error) {
    return Err(
      new PublishError("Failed to parse Git URL", "PARSE_ERROR", error),
    );
  }
}

/**
 * Get information about a remote
 */
export function getRemoteInfo(remote: GitRemote): RemoteInfo {
  const platform = detectPlatform(remote.url);
  const parsed = parseGitUrl(remote.url);

  const info: RemoteInfo = {
    name: remote.name,
    url: remote.url,
    platform,
  };

  if (parsed.ok) {
    info.owner = parsed.value.owner;
    info.repo = parsed.value.repo;
  }

  return info;
}

/**
 * Get the primary remote (usually 'origin')
 */
export async function getPrimaryRemote(
  path: string = Deno.cwd(),
): Promise<Result<RemoteInfo>> {
  const remotesResult = await getRemotes(path);

  if (!remotesResult.ok) {
    return Err(remotesResult.error);
  }

  const remotes = remotesResult.value;

  if (remotes.length === 0) {
    return Err(
      new PublishError("No remote repository found", "NO_REMOTE"),
    );
  }

  // Prefer 'origin' if it exists
  const origin = remotes.find((r) => r.name === "origin");
  const primaryRemote = origin || remotes[0];

  return Ok(getRemoteInfo(primaryRemote));
}

/**
 * Get setup instructions for a platform
 */
export function getRemoteSetupInstructions(
  platform: RemotePlatform,
): string[] {
  switch (platform) {
    case RemotePlatform.GITHUB:
      return [
        "1. Create a repository on GitHub:",
        "   • Visit https://github.com/new",
        "   • Or use GitHub CLI: gh repo create",
        "",
        "2. Add the remote to your local repository:",
        "   git remote add origin https://github.com/USERNAME/REPO.git",
        "",
        "3. Or with GitHub CLI:",
        "   gh repo create --source=. --push",
      ];

    case RemotePlatform.GITLAB:
      return [
        "1. Create a repository on GitLab:",
        "   • Visit https://gitlab.com/projects/new",
        "   • Or use GitLab CLI: glab repo create",
        "",
        "2. Add the remote to your local repository:",
        "   git remote add origin https://gitlab.com/USERNAME/REPO.git",
        "",
        "3. Or with GitLab CLI:",
        "   glab repo create --source=. --push",
      ];

    case RemotePlatform.BITBUCKET:
      return [
        "1. Create a repository on Bitbucket:",
        "   • Visit https://bitbucket.org/repo/create",
        "",
        "2. Add the remote to your local repository:",
        "   git remote add origin https://bitbucket.org/USERNAME/REPO.git",
      ];

    default:
      return [
        "1. Create a repository on your Git hosting platform",
        "",
        "2. Add the remote to your local repository:",
        "   git remote add origin <repository-url>",
      ];
  }
}

/**
 * Display setup instructions with optional platform detection
 */
export function displayRemoteSetup(logger: Logger, platform?: RemotePlatform): void {
  logger.section("Remote Repository Setup Required");

  const targetPlatform = platform || RemotePlatform.GITHUB;
  const instructions = getRemoteSetupInstructions(targetPlatform);

  logger.info("No remote repository is configured for this project.");
  logger.info("Follow these steps to set up a remote repository:\n");

  instructions.forEach((line) => console.log(line));

  logger.info("\nAfter adding the remote, run this command again.");
}

/**
 * Validate that a remote URL is accessible
 */
export function validateRemoteUrl(url: string): Result<void> {
  // Check if it's a valid Git URL pattern
  const isValid = /^(https?:\/\/|git@)/.test(url);

  if (!isValid) {
    return Err(
      new PublishError(
        "URL must start with https://, http://, or git@",
        "INVALID_REMOTE_URL",
      ),
    );
  }

  // For HTTP(S) URLs, validate as proper URL
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const urlResult = validateUrl(url);
    if (!urlResult.ok) {
      return Err(urlResult.error);
    }
  }

  return Ok(undefined);
}
