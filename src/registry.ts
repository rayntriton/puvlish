/**
 * Package registry detection and management module for publishjs
 */

import { exists } from "@std/fs";
import { join } from "@std/path";
import { Err, executeCommand, Logger, Ok, PublishError, Result } from "./utils.ts";

export enum RegistryType {
  NPM = "npm",
  JSR = "jsr",
}

export interface PackageInfo {
  name: string;
  version: string;
  registry: RegistryType;
  private?: boolean;
}

/**
 * Check if package.json exists and is valid for npm
 */
export async function detectNpmPackage(
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<PackageInfo>> {
  const packageJsonPath = join(path, "package.json");

  if (!await exists(packageJsonPath)) {
    return Err(
      new PublishError("package.json not found", "NPM_NOT_FOUND"),
    );
  }

  try {
    const content = await Deno.readTextFile(packageJsonPath);
    const pkg = JSON.parse(content);

    if (!pkg.name) {
      return Err(
        new PublishError(
          "package.json missing 'name' field",
          "NPM_INVALID_CONFIG",
        ),
      );
    }

    if (!pkg.version) {
      return Err(
        new PublishError(
          "package.json missing 'version' field",
          "NPM_INVALID_CONFIG",
        ),
      );
    }

    return Ok({
      name: pkg.name,
      version: pkg.version,
      registry: RegistryType.NPM,
      private: pkg.private === true,
    });
  } catch (error) {
    return Err(
      new PublishError(
        "Failed to parse package.json",
        "NPM_PARSE_ERROR",
        error,
      ),
    );
  }
}

/**
 * Check if deno.json or jsr.json exists and is valid for JSR
 */
export async function detectJsrPackage(
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<PackageInfo>> {
  // Check deno.json first
  const denoJsonPath = join(path, "deno.json");
  const jsrJsonPath = join(path, "jsr.json");

  let configPath: string | null = null;

  if (await exists(denoJsonPath)) {
    configPath = denoJsonPath;
  } else if (await exists(jsrJsonPath)) {
    configPath = jsrJsonPath;
  }

  if (!configPath) {
    return Err(
      new PublishError("deno.json or jsr.json not found", "JSR_NOT_FOUND"),
    );
  }

  try {
    const content = await Deno.readTextFile(configPath);
    const config = JSON.parse(content);

    if (!config.name) {
      return Err(
        new PublishError(
          `${configPath} missing 'name' field`,
          "JSR_INVALID_CONFIG",
        ),
      );
    }

    if (!config.version) {
      return Err(
        new PublishError(
          `${configPath} missing 'version' field`,
          "JSR_INVALID_CONFIG",
        ),
      );
    }

    return Ok({
      name: config.name,
      version: config.version,
      registry: RegistryType.JSR,
    });
  } catch (error) {
    return Err(
      new PublishError(
        `Failed to parse ${configPath}`,
        "JSR_PARSE_ERROR",
        error,
      ),
    );
  }
}

/**
 * Detect all available registries for the project
 */
export async function detectRegistries(
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<PackageInfo[]> {
  const registries: PackageInfo[] = [];

  // Check npm
  const npmResult = await detectNpmPackage(path, logger);
  if (npmResult.ok && !npmResult.value.private) {
    registries.push(npmResult.value);
  }

  // Check JSR
  const jsrResult = await detectJsrPackage(path, logger);
  if (jsrResult.ok) {
    registries.push(jsrResult.value);
  }

  return registries;
}

/**
 * Publish to npm registry
 */
export async function publishToNpm(
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  logger?.info("Publishing to npm...");

  // Check if npm is available
  const npmCheck = await executeCommand("npm", ["--version"], {}, logger);
  if (!npmCheck.ok) {
    return Err(
      new PublishError(
        "npm is not installed or not available in PATH",
        "NPM_NOT_AVAILABLE",
      ),
    );
  }

  // Read package.json to check private field
  const packageJsonPath = join(path, "package.json");
  let isPrivate = false;
  try {
    const content = await Deno.readTextFile(packageJsonPath);
    const pkg = JSON.parse(content);
    isPrivate = pkg.private === true;
  } catch (error) {
    logger?.warn(`Failed to read package.json: ${(error as Error).message}`);
  }

  // Get NPM token from environment
  const token = Deno.env.get("NPM_TOKEN");

  if (!token) {
    logger?.warn("NPM_TOKEN not found in environment");
    logger?.info("Attempting to publish with existing npm authentication");
    logger?.info("If this fails, set NPM_TOKEN environment variable");
    logger?.info("Get a token at: https://www.npmjs.com/settings/~/tokens");
  } else {
    logger?.debug("Using NPM_TOKEN for authentication");
  }

  // Build npm publish command with flags
  const publishArgs = ["publish", "--registry=https://registry.npmjs.org/"];

  // Add auth token if available
  if (token) {
    publishArgs.push(`--//registry.npmjs.org/:_authToken=${token}`);
  }

  // Add --access=public if package is not private
  // This is required for scoped packages on first publish
  if (!isPrivate) {
    publishArgs.push("--access=public");
    logger?.debug("Using --access=public for public package");
  }

  // Run npm publish with direct flags (no .npmrc needed)
  const result = await executeCommand("npm", publishArgs, { cwd: path }, logger);

  if (!result.ok) {
    const errorMessage = result.error.message;

    // Provide helpful error messages based on the error
    if (errorMessage.includes("authentication") || errorMessage.includes("401") || errorMessage.includes("403")) {
      logger?.error("npm authentication failed");
      logger?.info("Make sure your NPM_TOKEN is valid");
      logger?.info("Get a new token at: https://www.npmjs.com/settings/~/tokens");
      logger?.info("The token should have 'Automation' or 'Publish' permission");

      return Err(
        new PublishError(
          "npm authentication failed. Check your NPM_TOKEN is valid.",
          "NPM_AUTH_FAILED",
          result.error,
        ),
      );
    }

    if (errorMessage.includes("version") || errorMessage.includes("already exists")) {
      logger?.error("Version already published");
      logger?.info("Version must be unique and not already published");
      logger?.info("Update version in package.json and try again");

      return Err(
        new PublishError(
          "Version already published. Update version in package.json",
          "NPM_INVALID_VERSION",
          result.error,
        ),
      );
    }

    if (errorMessage.includes("name") || errorMessage.includes("package")) {
      logger?.error("Invalid package name or package not found");
      logger?.info("Check package name in package.json");

      return Err(
        new PublishError(
          "Invalid package name. Check package.json",
          "NPM_INVALID_NAME",
          result.error,
        ),
      );
    }

    // Generic error with full message
    logger?.error(`npm publish failed: ${errorMessage}`);

    return Err(
      new PublishError(
        `Failed to publish to npm: ${errorMessage}`,
        "NPM_PUBLISH_FAILED",
        result.error,
      ),
    );
  }

  logger?.success("Successfully published to npm");
  return Ok(undefined);
}

/**
 * Publish to JSR registry
 */
export async function publishToJsr(
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  logger?.info("Publishing to JSR...");

  // Get JSR token from environment
  const token = Deno.env.get("JSR_TOKEN");

  if (!token) {
    logger?.error("JSR_TOKEN not found in environment");
    logger?.info("Set JSR_TOKEN environment variable");
    logger?.info("Get a token at: https://jsr.io/account/tokens");

    return Err(
      new PublishError(
        "JSR_TOKEN not set. Get a token at https://jsr.io/account/tokens",
        "JSR_TOKEN_MISSING",
      ),
    );
  }

  // Run deno publish with token and --allow-dirty flag
  // IMPORTANT: Pass token via --token flag, not just environment variable
  const result = await executeCommand(
    "deno",
    ["publish", "--allow-dirty", "--token", token],
    { cwd: path },
    logger,
  );

  if (!result.ok) {
    const errorMessage = result.error.message;

    // Provide helpful error messages based on the error
    if (errorMessage.includes("authentication") || errorMessage.includes("token")) {
      logger?.error("JSR authentication failed");
      logger?.info("Make sure your JSR_TOKEN is valid");
      logger?.info("Get a new token at: https://jsr.io/account/tokens");

      return Err(
        new PublishError(
          "JSR authentication failed. Check your JSR_TOKEN is valid.",
          "JSR_AUTH_FAILED",
          result.error,
        ),
      );
    }

    if (errorMessage.includes("name") || errorMessage.includes("scope")) {
      logger?.error("Invalid package name in deno.json");
      logger?.info("Package name must be in format: @scope/package-name");

      return Err(
        new PublishError(
          "Invalid JSR package name. Check deno.json",
          "JSR_INVALID_NAME",
          result.error,
        ),
      );
    }

    if (errorMessage.includes("version")) {
      logger?.error("Invalid or duplicate version");
      logger?.info("Version must be valid semver and not already published");

      return Err(
        new PublishError(
          "Invalid or duplicate version. Update version in deno.json",
          "JSR_INVALID_VERSION",
          result.error,
        ),
      );
    }

    // Generic error with full message
    logger?.error(`JSR publish failed: ${errorMessage}`);

    return Err(
      new PublishError(
        `Failed to publish to JSR: ${errorMessage}`,
        "JSR_PUBLISH_FAILED",
        result.error,
      ),
    );
  }

  logger?.success("Successfully published to JSR");
  return Ok(undefined);
}

/**
 * Publish to a specific registry
 */
export async function publishToRegistry(
  registry: RegistryType,
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  switch (registry) {
    case RegistryType.NPM:
      return await publishToNpm(path, logger);
    case RegistryType.JSR:
      return await publishToJsr(path, logger);
    default:
      return Err(
        new PublishError(
          `Unknown registry type: ${registry}`,
          "UNKNOWN_REGISTRY",
        ),
      );
  }
}

/**
 * Get registry display name
 */
export function getRegistryName(registry: RegistryType): string {
  switch (registry) {
    case RegistryType.NPM:
      return "npm";
    case RegistryType.JSR:
      return "JSR";
    default:
      return "unknown";
  }
}

/**
 * Validate package configuration before publishing
 */
export async function validatePackage(
  registry: RegistryType,
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  const detectResult = registry === RegistryType.NPM
    ? await detectNpmPackage(path, logger)
    : await detectJsrPackage(path, logger);

  if (!detectResult.ok) {
    return Err(detectResult.error);
  }

  // Additional validations can be added here
  // For example: check if version already exists on registry

  return Ok(undefined);
}
