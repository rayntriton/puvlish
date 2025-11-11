/**
 * JSR authentication helper module
 */

import { Input } from "@cliffy/prompt";
import { Err, Logger, Ok, PublishError, Result } from "./utils.ts";

/**
 * Check if JSR_TOKEN environment variable is set
 */
export function hasJsrToken(): boolean {
  const token = Deno.env.get("JSR_TOKEN");
  return token !== undefined && token.length > 0;
}

/**
 * Get JSR token from environment
 */
export function getJsrToken(): string | undefined {
  return Deno.env.get("JSR_TOKEN");
}

/**
 * Display instructions for obtaining JSR token
 */
export function displayJsrTokenInstructions(logger: Logger): void {
  logger.section("JSR Authentication Setup");

  logger.info("To publish to JSR, you need an authentication token.\n");

  logger.info("Follow these steps:\n");

  const steps = [
    "1. Visit: https://jsr.io/account/tokens",
    "2. Click 'Create token' button",
    "3. Give your token a descriptive name (e.g., 'publishjs')",
    "4. Select appropriate permissions:",
    "   • Package publishing",
    "5. Click 'Create'",
    "6. Copy the token (you won't see it again!)",
  ];

  steps.forEach((step) => console.log(step));

  console.log("\n" + "Then set it as an environment variable:");
  console.log("\n  For current session:");
  console.log("  export JSR_TOKEN=your_token_here");

  console.log("\n  For permanent configuration, add to your shell profile:");
  console.log("  echo 'export JSR_TOKEN=your_token_here' >> ~/.bashrc");
  console.log("  # or ~/.zshrc if using zsh\n");

  logger.warn("Keep your token secure! Never commit it to version control.");
}

/**
 * Prompt user to set up JSR token
 */
async function promptJsrTokenSetup(logger: Logger): Promise<Result<void>> {
  displayJsrTokenInstructions(logger);

  try {
    await Input.prompt({
      message: "Press Enter after you've set the JSR_TOKEN environment variable...",
    });

    // Check if token is now available
    if (hasJsrToken()) {
      logger.success("JSR token detected!");
      return Ok(undefined);
    } else {
      logger.error("JSR_TOKEN environment variable is still not set");
      logger.info(
        "Make sure to export the variable in your current shell session",
      );

      return Err(
        new PublishError(
          "JSR_TOKEN not set after setup",
          "JSR_TOKEN_NOT_SET",
        ),
      );
    }
  } catch (error) {
    return Err(
      new PublishError(
        "JSR token setup cancelled",
        "JSR_TOKEN_SETUP_CANCELLED",
        error,
      ),
    );
  }
}

/**
 * Verify JSR authentication is configured
 */
export async function verifyJsrAuth(logger: Logger): Promise<Result<boolean>> {
  logger.debug("Checking JSR authentication...");

  if (hasJsrToken()) {
    logger.debug("JSR token found");
    return Ok(true);
  }

  logger.warn("JSR_TOKEN environment variable is not set");
  logger.info("Authentication is required to publish to JSR");

  const setupResult = await promptJsrTokenSetup(logger);

  if (!setupResult.ok) {
    return Err(setupResult.error);
  }

  return Ok(true);
}

/**
 * Display JSR token status (for diagnostics)
 */
export function displayJsrTokenStatus(logger: Logger): void {
  if (hasJsrToken()) {
    const token = getJsrToken()!;
    const masked = token.substring(0, 8) + "..." + token.substring(token.length - 4);
    logger.success(`JSR token configured: ${masked}`);
  } else {
    logger.warn("JSR token not configured");
    logger.info("Set JSR_TOKEN environment variable to publish to JSR");
  }
}

/**
 * Validate JSR token format (basic check)
 */
export function validateJsrTokenFormat(token: string): boolean {
  // JSR tokens are typically UUIDs or similar format
  // Basic validation: should be non-empty and reasonable length
  return token.length >= 20 && token.length <= 200;
}
