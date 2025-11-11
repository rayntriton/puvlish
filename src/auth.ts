/**
 * Authentication module for publishjs
 */

import { canPush } from "./git.ts";
import { RemotePlatform } from "./remote.ts";
import { Err, Logger, Ok, PublishError, Result } from "./utils.ts";

export enum AuthMethod {
  SSH = "ssh",
  HTTPS = "https",
  UNKNOWN = "unknown",
}

/**
 * Detect authentication method from remote URL
 */
export function detectAuthMethod(remoteUrl: string): AuthMethod {
  if (remoteUrl.startsWith("git@")) {
    return AuthMethod.SSH;
  } else if (remoteUrl.startsWith("https://") || remoteUrl.startsWith("http://")) {
    return AuthMethod.HTTPS;
  }
  return AuthMethod.UNKNOWN;
}

/**
 * Check if user has push permissions to remote
 */
export async function checkPushPermissions(
  remote: string = "origin",
  branch?: string,
  path: string = Deno.cwd(),
): Promise<Result<boolean>> {
  try {
    const canPushResult = await canPush(remote, branch, path);
    return Ok(canPushResult);
  } catch (error) {
    return Err(
      new PublishError(
        "Failed to check push permissions",
        "AUTH_CHECK_FAILED",
        error,
      ),
    );
  }
}

/**
 * Get Personal Access Token setup instructions for a platform
 */
export function getTokenInstructions(platform: RemotePlatform): string[] {
  switch (platform) {
    case RemotePlatform.GITHUB:
      return [
        "To create a Personal Access Token on GitHub:",
        "",
        "1. Visit: https://github.com/settings/tokens/new",
        "2. Give your token a descriptive name (e.g., 'publishjs')",
        "3. Set expiration (recommended: 90 days)",
        "4. Select scopes:",
        "   ✓ repo (Full control of private repositories)",
        "5. Click 'Generate token'",
        "6. Copy the token (you won't see it again!)",
        "",
        "Set the token as an environment variable:",
        "  export GITHUB_TOKEN=your_token_here",
        "",
        "Or configure Git to use the token:",
        "  git config --global credential.helper store",
        "  # Then on next push, use token as password",
      ];

    case RemotePlatform.GITLAB:
      return [
        "To create a Personal Access Token on GitLab:",
        "",
        "1. Visit: https://gitlab.com/-/profile/personal_access_tokens",
        "2. Give your token a descriptive name (e.g., 'publishjs')",
        "3. Set expiration date (optional)",
        "4. Select scopes:",
        "   ✓ api (Full API access)",
        "   ✓ write_repository (Write to repository)",
        "5. Click 'Create personal access token'",
        "6. Copy the token (you won't see it again!)",
        "",
        "Set the token as an environment variable:",
        "  export GITLAB_TOKEN=your_token_here",
        "",
        "Or configure Git to use the token:",
        "  git config --global credential.helper store",
        "  # Then on next push, use token as password",
      ];

    default:
      return [
        "To authenticate with your Git hosting platform:",
        "",
        "1. Create a Personal Access Token in your platform's settings",
        "2. Give it permission to push to repositories",
        "3. Copy the token",
        "",
        "Then set it as an environment variable or configure Git:",
        "  git config --global credential.helper store",
        "  # Then on next push, use token as password",
      ];
  }
}

/**
 * Get SSH setup instructions
 */
export function getSshInstructions(): string[] {
  return [
    "To set up SSH authentication:",
    "",
    "1. Generate an SSH key (if you don't have one):",
    "   ssh-keygen -t ed25519 -C 'your_email@example.com'",
    "",
    "2. Start the SSH agent:",
    "   eval \"$(ssh-agent -s)\"",
    "",
    "3. Add your SSH key to the agent:",
    "   ssh-add ~/.ssh/id_ed25519",
    "",
    "4. Add the public key to your Git hosting platform:",
    "   • GitHub: https://github.com/settings/keys",
    "   • GitLab: https://gitlab.com/-/profile/keys",
    "",
    "5. Test the connection:",
    "   ssh -T git@github.com",
    "   # or",
    "   ssh -T git@gitlab.com",
  ];
}

/**
 * Display authentication setup instructions
 */
export function displayAuthSetup(
  logger: Logger,
  authMethod: AuthMethod,
  platform: RemotePlatform,
): void {
  logger.section("Authentication Setup Required");

  logger.warn(
    "You don't have permission to push to the remote repository.",
  );
  logger.info("This could be due to missing or invalid credentials.\n");

  if (authMethod === AuthMethod.SSH) {
    logger.info("Your remote uses SSH authentication.\n");
    const instructions = getSshInstructions();
    instructions.forEach((line) => console.log(line));
  } else if (authMethod === AuthMethod.HTTPS) {
    logger.info("Your remote uses HTTPS authentication.\n");
    const instructions = getTokenInstructions(platform);
    instructions.forEach((line) => console.log(line));
  } else {
    logger.info("Unable to determine authentication method.\n");
    logger.info("SSH Instructions:");
    getSshInstructions().forEach((line) => console.log(line));
    logger.info("\nHTTPS/Token Instructions:");
    getTokenInstructions(platform).forEach((line) => console.log(line));
  }

  logger.info("\nAfter setting up authentication, run this command again.");
}

/**
 * Get token from environment variable based on platform
 */
export function getTokenFromEnv(platform: RemotePlatform): string | undefined {
  switch (platform) {
    case RemotePlatform.GITHUB:
      return Deno.env.get("GITHUB_TOKEN") || Deno.env.get("GH_TOKEN");
    case RemotePlatform.GITLAB:
      return Deno.env.get("GITLAB_TOKEN") || Deno.env.get("GL_TOKEN");
    default:
      return Deno.env.get("GIT_TOKEN");
  }
}

/**
 * Verify authentication for publishing
 */
export async function verifyAuth(
  remoteUrl: string,
  platform: RemotePlatform,
  remote: string = "origin",
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  logger?.debug("Checking push permissions...");

  const authMethod = detectAuthMethod(remoteUrl);
  const canPushResult = await checkPushPermissions(remote, undefined, path);

  if (!canPushResult.ok) {
    return Err(canPushResult.error);
  }

  if (!canPushResult.value) {
    displayAuthSetup(logger || new Logger(), authMethod, platform);
    return Err(
      new PublishError(
        "Push permissions check failed. Please set up authentication.",
        "AUTH_FAILED",
      ),
    );
  }

  logger?.debug("Authentication verified");
  return Ok(undefined);
}
