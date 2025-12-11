/**
 * NPM package configuration module
 */

import { exists } from "@std/fs";
import { join } from "@std/path";
import { Input, Confirm } from "@cliffy/prompt";
import { Err, Logger, Ok, PublishError, Result, sanitizeGitUrl } from "./utils.ts";

export interface NpmPackageConfig {
  name: string;
  version: string;
  description?: string;
  main?: string;
  types?: string;
  author?: string;
  license?: string;
  keywords?: string[];
  repository?: {
    type: string;
    url: string;
  };
  bugs?: {
    url: string;
  };
  homepage?: string;
  private?: boolean;
}

/**
 * Get default values for npm package
 */
export async function getNpmDefaults(
  path: string = Deno.cwd(),
): Promise<Partial<NpmPackageConfig>> {
  const { basename } = await import("@std/path");
  const dirName = basename(path);

  // Try to get git config
  const { executeCommand } = await import("./utils.ts");
  let author = "";
  let repoUrl = "";

  const nameResult = await executeCommand("git", ["config", "user.name"], { cwd: path });
  const emailResult = await executeCommand("git", ["config", "user.email"], { cwd: path });

  if (nameResult.ok && emailResult.ok) {
    author = `${nameResult.value.trim()} <${emailResult.value.trim()}>`;
  }

  const remoteResult = await executeCommand("git", ["remote", "get-url", "origin"], { cwd: path });
  if (remoteResult.ok) {
    // SECURITY: Remove any credentials from URL before storing in package.json
    repoUrl = sanitizeGitUrl(remoteResult.value.trim());
  }

  return {
    name: dirName,
    version: "0.1.0",
    description: "",
    main: "index.js",
    author,
    license: "MIT",
    ...(repoUrl && {
      repository: {
        type: "git",
        url: repoUrl,
      },
    }),
  };
}

/**
 * Check if package.json exists
 */
export async function packageJsonExists(path: string = Deno.cwd()): Promise<boolean> {
  const packageJsonPath = join(path, "package.json");
  return await exists(packageJsonPath);
}

/**
 * Read existing package.json
 */
export async function readPackageJson(
  path: string = Deno.cwd(),
): Promise<Result<NpmPackageConfig>> {
  const packageJsonPath = join(path, "package.json");

  try {
    const content = await Deno.readTextFile(packageJsonPath);
    const config = JSON.parse(content) as NpmPackageConfig;
    return Ok(config);
  } catch (error) {
    return Err(
      new PublishError(
        "Failed to read package.json",
        "NPM_READ_FAILED",
        error,
      ),
    );
  }
}

/**
 * Prompt user for npm package configuration
 */
export async function promptNpmConfig(
  defaults: Partial<NpmPackageConfig>,
  existingConfig?: NpmPackageConfig,
): Promise<Result<NpmPackageConfig>> {
  try {
    const config: NpmPackageConfig = {
      name: "",
      version: "",
    };

    // Package name
    config.name = await Input.prompt({
      message: "Package name:",
      default: existingConfig?.name || defaults.name || "",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Package name is required";
        }
        // npm package name validation
        if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(value)) {
          return "Invalid npm package name. Must be lowercase, can contain hyphens and underscores.";
        }
        return true;
      },
    });

    // Version
    config.version = await Input.prompt({
      message: "Version:",
      default: existingConfig?.version || defaults.version || "0.1.0",
      validate: (value) => {
        // Semver validation
        if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(value)) {
          return "Invalid semver version (e.g., 1.0.0, 1.0.0-beta.1)";
        }
        return true;
      },
    });

    // Description
    config.description = await Input.prompt({
      message: "Description:",
      default: existingConfig?.description || defaults.description || "",
    });

    // Private package
    const isPrivate = await Confirm.prompt({
      message: "Is this a private package (not published to public registry)?",
      default: existingConfig?.private || false,
    });

    if (isPrivate) {
      config.private = true;
    }
    // Note: if false, we don't set it (undefined), which allows --access=public to work

    // Entry point
    config.main = await Input.prompt({
      message: "Entry point:",
      default: existingConfig?.main || defaults.main || "index.js",
    });

    // Types (optional)
    const hasTypes = await Confirm.prompt({
      message: "Do you have TypeScript declarations?",
      default: !!existingConfig?.types || false,
    });

    if (hasTypes) {
      config.types = await Input.prompt({
        message: "Types entry point:",
        default: existingConfig?.types || config.main.replace(/\.js$/, ".d.ts"),
      });
    }

    // Author
    config.author = await Input.prompt({
      message: "Author:",
      default: existingConfig?.author || defaults.author || "",
    });

    // License
    config.license = await Input.prompt({
      message: "License:",
      default: existingConfig?.license || defaults.license || "MIT",
    });

    // Keywords (optional)
    const keywordsInput = await Input.prompt({
      message: "Keywords (comma-separated, optional):",
      default: existingConfig?.keywords?.join(", ") || "",
    });

    if (keywordsInput.trim()) {
      config.keywords = keywordsInput.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
    }

    // Repository (from defaults if available)
    if (defaults.repository) {
      config.repository = defaults.repository;
    }

    return Ok(config);
  } catch (error) {
    return Err(
      new PublishError(
        "NPM configuration cancelled",
        "NPM_CONFIG_CANCELLED",
        error,
      ),
    );
  }
}

/**
 * Create package.json file
 */
export async function createPackageJson(
  config: NpmPackageConfig,
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  const packageJsonPath = join(path, "package.json");

  try {
    logger?.info("Creating package.json...");

    // Generate package.json content
    const content = JSON.stringify(config, null, 2) + "\n";

    await Deno.writeTextFile(packageJsonPath, content);
    logger?.success("package.json created");

    return Ok(undefined);
  } catch (error) {
    return Err(
      new PublishError(
        "Failed to create package.json",
        "NPM_CREATE_FAILED",
        error,
      ),
    );
  }
}

/**
 * Update existing package.json file
 */
export async function updatePackageJson(
  config: NpmPackageConfig,
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  return createPackageJson(config, path, logger);
}

/**
 * Validate package.json configuration
 */
export function validateNpmConfig(config: NpmPackageConfig): Result<boolean> {
  // Check required fields
  if (!config.name || config.name.trim().length === 0) {
    return Err(
      new PublishError("Package name is required", "NPM_VALIDATION_FAILED"),
    );
  }

  if (!config.version || config.version.trim().length === 0) {
    return Err(
      new PublishError("Version is required", "NPM_VALIDATION_FAILED"),
    );
  }

  // Validate package name format
  if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(config.name)) {
    return Err(
      new PublishError(
        "Invalid npm package name format",
        "NPM_VALIDATION_FAILED",
      ),
    );
  }

  // Validate semver
  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(config.version)) {
    return Err(
      new PublishError("Invalid semver version", "NPM_VALIDATION_FAILED"),
    );
  }

  return Ok(true);
}
