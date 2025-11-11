/**
 * Auto-initialization module for Git repositories
 */

import { exists } from "@std/fs";
import { join } from "@std/path";
import { executeCommand, Err, Logger, Ok, PublishError, Result } from "./utils.ts";
import { isGitRepository } from "./git.ts";
import { Confirm, Input } from "@cliffy/prompt";

/**
 * Default .gitignore content for common project types
 */
const DEFAULT_GITIGNORE = `# Dependencies
node_modules/
npm-debug.log*

# Deno
.deno/
deno.lock

# Build outputs
dist/
build/
*.js.map

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
.env.*.local

# Logs
*.log
logs/

# Testing
coverage/
.nyc_output/
`;

/**
 * Check if directory needs Git initialization
 */
export async function needsGitInit(path: string = Deno.cwd()): Promise<boolean> {
  return !(await isGitRepository(path));
}

/**
 * Prompt user if they want to initialize Git
 */
export async function promptInitGit(logger: Logger): Promise<boolean> {
  logger.warn("This directory is not a Git repository.");
  logger.info("Git is required for version control and publishing.");

  try {
    const answer = await Confirm.prompt({
      message: "Would you like to initialize a Git repository now?",
      default: true,
    });

    return answer;
  } catch {
    return false;
  }
}

/**
 * Create a default .gitignore file if it doesn't exist
 */
async function createGitignoreIfNeeded(
  path: string,
  logger: Logger,
): Promise<Result<void>> {
  const gitignorePath = join(path, ".gitignore");

  if (await exists(gitignorePath)) {
    logger.debug(".gitignore already exists, skipping creation");
    return Ok(undefined);
  }

  try {
    await Deno.writeTextFile(gitignorePath, DEFAULT_GITIGNORE);
    logger.success("Created .gitignore file");
    return Ok(undefined);
  } catch (error) {
    return Err(
      new PublishError(
        "Failed to create .gitignore",
        "GITIGNORE_CREATE_FAILED",
        error,
      ),
    );
  }
}

/**
 * Initialize Git repository
 */
async function initGit(path: string, logger: Logger): Promise<Result<void>> {
  logger.info("Initializing Git repository...");

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

  logger.success("Git repository initialized");
  return Ok(undefined);
}

/**
 * Create initial commit
 */
async function createInitialCommit(
  path: string,
  logger: Logger,
): Promise<Result<void>> {
  logger.info("Creating initial commit...");

  // Check if there are any files to commit
  const statusResult = await executeCommand("git", ["status", "--porcelain"], {
    cwd: path,
  });

  if (!statusResult.ok) {
    return Err(
      new PublishError(
        "Failed to check git status",
        "GIT_STATUS_FAILED",
        statusResult.error,
      ),
    );
  }

  const hasChanges = statusResult.value.length > 0;

  if (!hasChanges) {
    logger.info("No files to commit yet");
    return Ok(undefined);
  }

  // Prompt for commit message
  logger.info("Creating initial commit with existing files...");

  let commitMessage = "Initial commit";

  try {
    const shouldCustomize = await Confirm.prompt({
      message: "Would you like to customize the initial commit message?",
      default: false,
    });

    if (shouldCustomize) {
      commitMessage = await Input.prompt({
        message: "Enter commit message:",
        default: "Initial commit",
      });
    }
  } catch {
    // User cancelled, use default
  }

  // Add all files
  const addResult = await executeCommand("git", ["add", "."], { cwd: path });

  if (!addResult.ok) {
    return Err(
      new PublishError(
        "Failed to add files to Git",
        "GIT_ADD_FAILED",
        addResult.error,
      ),
    );
  }

  // Create commit
  const commitResult = await executeCommand(
    "git",
    ["commit", "-m", commitMessage],
    { cwd: path },
  );

  if (!commitResult.ok) {
    return Err(
      new PublishError(
        "Failed to create initial commit",
        "GIT_COMMIT_FAILED",
        commitResult.error,
      ),
    );
  }

  logger.success(`Initial commit created: "${commitMessage}"`);
  return Ok(undefined);
}

/**
 * Configure Git user if not already configured
 */
async function ensureGitUser(path: string, logger: Logger): Promise<Result<void>> {
  // Check if user.name is configured
  const nameResult = await executeCommand(
    "git",
    ["config", "user.name"],
    { cwd: path },
  );

  const emailResult = await executeCommand(
    "git",
    ["config", "user.email"],
    { cwd: path },
  );

  const hasName = nameResult.ok && nameResult.value.length > 0;
  const hasEmail = emailResult.ok && emailResult.value.length > 0;

  if (hasName && hasEmail) {
    logger.debug("Git user already configured");
    return Ok(undefined);
  }

  logger.warn("Git user information is not configured.");
  logger.info("This is required for creating commits.");

  try {
    let name = "";
    let email = "";

    if (!hasName) {
      name = await Input.prompt({
        message: "Enter your name for Git commits:",
        validate: (value) => value.trim().length > 0 || "Name is required",
      });

      const setNameResult = await executeCommand(
        "git",
        ["config", "user.name", name],
        { cwd: path },
      );

      if (!setNameResult.ok) {
        return Err(
          new PublishError(
            "Failed to set Git user name",
            "GIT_CONFIG_FAILED",
            setNameResult.error,
          ),
        );
      }
    }

    if (!hasEmail) {
      email = await Input.prompt({
        message: "Enter your email for Git commits:",
        validate: (value) =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
          "Valid email is required",
      });

      const setEmailResult = await executeCommand(
        "git",
        ["config", "user.email", email],
        { cwd: path },
      );

      if (!setEmailResult.ok) {
        return Err(
          new PublishError(
            "Failed to set Git user email",
            "GIT_CONFIG_FAILED",
            setEmailResult.error,
          ),
        );
      }
    }

    logger.success("Git user configured");
    return Ok(undefined);
  } catch (error) {
    return Err(
      new PublishError(
        "Git user configuration cancelled",
        "GIT_CONFIG_CANCELLED",
        error,
      ),
    );
  }
}

/**
 * Automatically initialize Git repository with all necessary setup
 */
export async function autoInitializeGit(
  path: string = Deno.cwd(),
  logger: Logger,
): Promise<Result<void>> {
  // Check if already a Git repo
  if (await isGitRepository(path)) {
    logger.debug("Already a Git repository");
    return Ok(undefined);
  }

  // Prompt user
  const shouldInit = await promptInitGit(logger);

  if (!shouldInit) {
    return Err(
      new PublishError(
        "User declined Git initialization",
        "GIT_INIT_DECLINED",
      ),
    );
  }

  // Initialize Git
  const initResult = await initGit(path, logger);
  if (!initResult.ok) return Err(initResult.error);

  // Create .gitignore
  const gitignoreResult = await createGitignoreIfNeeded(path, logger);
  if (!gitignoreResult.ok) {
    logger.warn("Failed to create .gitignore, continuing anyway...");
  }

  // Ensure Git user is configured
  const userResult = await ensureGitUser(path, logger);
  if (!userResult.ok) return Err(userResult.error);

  // Create initial commit
  const commitResult = await createInitialCommit(path, logger);
  if (!commitResult.ok) {
    logger.warn("Failed to create initial commit, continuing anyway...");
  }

  logger.success("Git repository setup complete!");
  return Ok(undefined);
}
