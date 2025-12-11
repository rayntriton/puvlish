/**
 * Auto-remote creation module for GitHub/GitLab repositories
 */

import { basename } from "@std/path";
import { Confirm, Input, Select } from "@cliffy/prompt";
import { addRemote, getRemotes } from "./git.ts";
import { displayRemoteSetup, RemotePlatform } from "./remote.ts";
import { executeCommand, Err, Logger, Ok, PublishError, Result } from "./utils.ts";

export interface RemoteCreationOptions {
  name: string;
  isPrivate: boolean;
  platform: RemotePlatform;
}

/**
 * Check if gh CLI is available
 */
async function isGhCliAvailable(logger?: Logger): Promise<boolean> {
  const result = await executeCommand("gh", ["--version"], undefined, logger);
  return result.ok;
}

/**
 * Check if glab CLI is available
 */
async function isGlabCliAvailable(logger?: Logger): Promise<boolean> {
  const result = await executeCommand("glab", ["--version"], undefined, logger);
  return result.ok;
}

/**
 * Get suggested repository name from current directory
 */
function getSuggestedRepoName(path: string = Deno.cwd()): string {
  return basename(path);
}

/**
 * Prompt user for repository creation details
 */
async function promptRepoCreation(
  suggestedName: string,
  hasGhCli: boolean,
  hasGlabCli: boolean,
): Promise<Result<RemoteCreationOptions>> {
  try {
    // Ask if they want to create a repo
    const shouldCreate = await Confirm.prompt({
      message: "Would you like to create a remote repository now?",
      default: true,
    });

    if (!shouldCreate) {
      return Err(
        new PublishError(
          "User declined repository creation",
          "REPO_CREATE_DECLINED",
        ),
      );
    }

    // Select platform
    const platformOptions = [];

    if (hasGhCli) {
      platformOptions.push({
        value: RemotePlatform.GITHUB,
        name: "GitHub (using gh CLI)",
      });
    }

    if (hasGlabCli) {
      platformOptions.push({
        value: RemotePlatform.GITLAB,
        name: "GitLab (using glab CLI)",
      });
    }

    if (platformOptions.length === 0) {
      return Err(
        new PublishError(
          "No CLI tools available (gh or glab)",
          "NO_CLI_TOOLS",
        ),
      );
    }

    let platform: RemotePlatform;

    if (platformOptions.length === 1) {
      platform = platformOptions[0].value;
    } else {
      platform = await Select.prompt({
        message: "Select platform:",
        options: platformOptions,
      }) as RemotePlatform;
    }

    // Detect user/org based on platform
    let detectedUser: string | null = null;
    if (platform === RemotePlatform.GITHUB) {
      const userResult = await executeCommand("gh", ["api", "user", "--jq", ".login"], {});
      if (userResult.ok && userResult.value.trim()) {
        detectedUser = userResult.value.trim();
      }
    } else if (platform === RemotePlatform.GITLAB) {
      const userResult = await executeCommand("glab", ["api", "user", "--jq", ".username"], {});
      if (userResult.ok && userResult.value.trim()) {
        detectedUser = userResult.value.trim();
      }
    }

    // Prompt for org/user
    const orgUser = await Input.prompt({
      message: "Organization or username:",
      default: detectedUser || "",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Organization/username is required";
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
          return "Can only contain letters, numbers, hyphens, and underscores";
        }
        return true;
      },
    });

    // Get package/repository name
    const packageName = await Input.prompt({
      message: "Package/Repository name:",
      default: suggestedName,
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Repository name is required";
        }
        if (!/^[a-zA-Z0-9_.-]+$/.test(value)) {
          return "Repository name can only contain letters, numbers, hyphens, underscores, and dots";
        }
        return true;
      },
    });

    // Ask if private
    const isPrivate = await Confirm.prompt({
      message: "Make repository private?",
      default: false,
    });

    // Combine org/user with package name for full repository path
    const fullName = `${orgUser.trim()}/${packageName.trim()}`;

    return Ok({
      name: fullName,
      isPrivate,
      platform,
    });
  } catch (error) {
    return Err(
      new PublishError(
        "Repository creation prompt cancelled",
        "REPO_PROMPT_CANCELLED",
        error,
      ),
    );
  }
}

/**
 * Create repository using GitHub CLI
 */
async function createGitHubRepo(
  name: string,
  isPrivate: boolean,
  path: string,
  logger: Logger,
): Promise<Result<string>> {
  logger.info(`Creating GitHub repository: ${name}...`);

  const args = [
    "repo",
    "create",
    name,
    "--source=.",
    isPrivate ? "--private" : "--public",
  ];

  // Note: NOT adding --push yet, we'll do that separately
  const result = await executeCommand("gh", args, { cwd: path }, logger);

  if (!result.ok) {
    return Err(
      new PublishError(
        `Failed to create GitHub repository: ${result.error.message}`,
        "GITHUB_CREATE_FAILED",
        result.error,
      ),
    );
  }

  // Extract repository URL from gh CLI
  const urlResult = await executeCommand(
    "gh",
    ["repo", "view", "--json", "url", "-q", ".url"],
    { cwd: path },
    logger,
  );

  if (!urlResult.ok) {
    logger.warn("Could not get repository URL, but repo was created");
    return Ok(`https://github.com/${name}`); // Fallback
  }

  logger.success(`GitHub repository created: ${urlResult.value}`);
  return Ok(urlResult.value);
}

/**
 * Create repository using GitLab CLI
 */
async function createGitLabRepo(
  name: string,
  isPrivate: boolean,
  path: string,
  logger: Logger,
): Promise<Result<string>> {
  logger.info(`Creating GitLab repository: ${name}...`);

  const args = [
    "repo",
    "create",
    name,
    isPrivate ? "--private" : "--public",
  ];

  const result = await executeCommand("glab", args, { cwd: path }, logger);

  if (!result.ok) {
    return Err(
      new PublishError(
        `Failed to create GitLab repository: ${result.error.message}`,
        "GITLAB_CREATE_FAILED",
        result.error,
      ),
    );
  }

  logger.success(`GitLab repository created`);

  // Try to get URL
  const urlResult = await executeCommand(
    "glab",
    ["repo", "view", "--web", "--no-web"],
    { cwd: path },
    logger,
  );

  if (urlResult.ok) {
    return Ok(urlResult.value.trim());
  }

  return Ok(`https://gitlab.com/${name}`); // Fallback
}

/**
 * Check if remote already exists
 */
async function hasRemote(
  remoteName: string = "origin",
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<boolean> {
  const remotesResult = await getRemotes(path, logger);
  if (!remotesResult.ok) return false;

  return remotesResult.value.some((r) => r.name === remoteName);
}

/**
 * Perform initial push to sync local and remote repositories
 */
async function initialPushToRemote(
  remoteName: string,
  branch: string,
  path: string,
  logger: Logger,
): Promise<Result<void>> {
  logger.info(`Pushing ${branch} to ${remoteName}...`);

  const result = await executeCommand(
    "git",
    ["push", "-u", remoteName, branch],
    { cwd: path },
    logger,
  );

  if (!result.ok) {
    return Err(
      new PublishError(
        `Failed to push to ${remoteName}`,
        "GIT_PUSH_FAILED",
        result.error,
      ),
    );
  }

  logger.success(`Successfully pushed ${branch} to ${remoteName}`);
  return Ok(undefined);
}

/**
 * Automatically create remote repository and configure it
 */
export async function autoCreateRemote(
  path: string = Deno.cwd(),
  logger: Logger,
): Promise<Result<string>> {
  // Check if remote already exists
  if (await hasRemote("origin", path, logger)) {
    logger.debug("Remote 'origin' already exists");
    return Err(
      new PublishError(
        "Remote already exists",
        "REMOTE_EXISTS",
      ),
    );
  }

  logger.section("Remote Repository Setup");

  // Check available CLI tools
  const hasGhCli = await isGhCliAvailable(logger);
  const hasGlabCli = await isGlabCliAvailable(logger);

  logger.info("Checking available CLI tools...");
  if (hasGhCli) logger.success("GitHub CLI (gh) detected");
  if (hasGlabCli) logger.success("GitLab CLI (glab) detected");

  if (!hasGhCli && !hasGlabCli) {
    logger.warn("No CLI tools detected (gh or glab)");
    logger.info(
      "Install GitHub CLI: https://cli.github.com/ or GitLab CLI: https://gitlab.com/gitlab-org/cli",
    );

    // Show manual instructions
    displayRemoteSetup(logger);

    return Err(
      new PublishError(
        "No CLI tools available for automatic repository creation",
        "NO_CLI_TOOLS",
      ),
    );
  }

  // Get repository creation details
  const suggestedName = getSuggestedRepoName(path);
  const optionsResult = await promptRepoCreation(
    suggestedName,
    hasGhCli,
    hasGlabCli,
  );

  if (!optionsResult.ok) {
    const error = optionsResult.error;
    if (error instanceof PublishError && error.code === "REPO_CREATE_DECLINED") {
      // User chose not to create, show manual instructions
      displayRemoteSetup(logger);
    }
    return Err(error);
  }

  const options = optionsResult.value;

  // Create repository based on platform
  let repoUrl: string;

  if (options.platform === RemotePlatform.GITHUB) {
    const urlResult = await createGitHubRepo(
      options.name,
      options.isPrivate,
      path,
      logger,
    );
    if (!urlResult.ok) return Err(urlResult.error);
    repoUrl = urlResult.value;
  } else if (options.platform === RemotePlatform.GITLAB) {
    const urlResult = await createGitLabRepo(
      options.name,
      options.isPrivate,
      path,
      logger,
    );
    if (!urlResult.ok) return Err(urlResult.error);
    repoUrl = urlResult.value;
  } else {
    return Err(
      new PublishError(
        "Unsupported platform",
        "UNSUPPORTED_PLATFORM",
      ),
    );
  }

  // Verify remote was added (gh/glab might have done it automatically)
  if (await hasRemote("origin", path, logger)) {
    logger.success("Remote 'origin' configured automatically");
  } else {
    // If not, add it manually
    logger.info("Configuring remote...");
    const addResult = await addRemote("origin", repoUrl, path, logger);

    if (!addResult.ok) {
      return Err(addResult.error);
    }
  }

  // Inject authentication token if available (for HTTPS remotes)
  const { getTokenFromEnv, setRemoteUrlWithToken, detectAuthMethod, AuthMethod } = await import("./auth.ts");

  const authMethod = detectAuthMethod(repoUrl);
  if (authMethod === AuthMethod.HTTPS) {
    const token = getTokenFromEnv(options.platform);

    if (token) {
      logger.info("Configuring authentication with token from environment...");
      const tokenResult = await setRemoteUrlWithToken("origin", repoUrl, token, path, logger);

      if (!tokenResult.ok) {
        logger.warn("Failed to configure token, authentication may be required later");
      }
    } else {
      logger.debug("No token found in environment for automatic authentication");
    }
  }

  // Perform initial push to sync repositories
  const pushResult = await initialPushToRemote("origin", "main", path, logger);
  if (!pushResult.ok) {
    logger.warn("Failed to push initial commit to remote");
    logger.info("You can push manually later with: git push -u origin main");
    // Don't fail the whole process, just warn
  }

  logger.success("Remote repository setup complete!");
  return Ok(repoUrl);
}

/**
 * Check if project needs remote setup
 */
export async function needsRemoteSetup(
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<boolean> {
  return !(await hasRemote("origin", path, logger));
}
