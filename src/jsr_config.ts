/**
 * JSR (JavaScript Registry) package configuration module
 */

import { exists } from "@std/fs";
import { join } from "@std/path";
import { Input, Confirm } from "@cliffy/prompt";
import { Err, Logger, Ok, PublishError, Result, sanitizeGitUrl } from "./utils.ts";

export interface JsrPackageConfig {
  name: string; // @scope/package-name
  version: string;
  exports?: string | Record<string, string>;
  license?: string;
  repository?: {
    type: string;
    url: string;
  };
}

/**
 * Get default values for JSR package
 */
export async function getJsrDefaults(
  path: string = Deno.cwd(),
): Promise<Partial<JsrPackageConfig>> {
  const { basename } = await import("@std/path");
  const dirName = basename(path);

  // Try to get git config for scope suggestion
  const { executeCommand } = await import("./utils.ts");
  let scope = "";
  let repoUrl = "";

  // Try to get GitHub username from remote URL
  const remoteResult = await executeCommand("git", ["remote", "get-url", "origin"], { cwd: path });
  if (remoteResult.ok) {
    const rawUrl = remoteResult.value.trim();
    // Extract scope from URL BEFORE sanitizing
    const match = rawUrl.match(/github\.com[:/]([^/]+)/);
    if (match) {
      scope = `@${match[1]}`;
    }
    // SECURITY: Remove any credentials from URL before storing in deno.json
    repoUrl = sanitizeGitUrl(rawUrl);
  }

  // If no scope from git, try git user.name
  if (!scope) {
    const nameResult = await executeCommand("git", ["config", "user.name"], { cwd: path });
    if (nameResult.ok) {
      const username = nameResult.value.trim().toLowerCase().replace(/\s+/g, "-");
      scope = `@${username}`;
    }
  }

  return {
    name: scope ? `${scope}/${dirName}` : `@scope/${dirName}`,
    version: "0.1.0",
    exports: "./mod.ts",
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
 * Check if deno.json exists
 */
export async function denoJsonExists(path: string = Deno.cwd()): Promise<boolean> {
  const denoJsonPath = join(path, "deno.json");
  return await exists(denoJsonPath);
}

/**
 * Read existing deno.json
 */
export async function readDenoJson(
  path: string = Deno.cwd(),
): Promise<Result<JsrPackageConfig>> {
  const denoJsonPath = join(path, "deno.json");

  try {
    const content = await Deno.readTextFile(denoJsonPath);
    const config = JSON.parse(content) as JsrPackageConfig;
    return Ok(config);
  } catch (error) {
    return Err(
      new PublishError(
        "Failed to read deno.json",
        "JSR_READ_FAILED",
        error,
      ),
    );
  }
}

/**
 * Suggest export files based on directory contents
 */
async function suggestExports(path: string): Promise<Record<string, string>> {
  const exports: Record<string, string> = {};

  // Check for common entry points
  const commonFiles = ["mod.ts", "index.ts", "main.ts", "src/mod.ts", "src/index.ts"];

  for (const file of commonFiles) {
    const filePath = join(path, file);
    if (await exists(filePath)) {
      const exportName = file === "mod.ts" || file === "index.ts" || file === "main.ts"
        ? "."
        : `./${file.replace(/\.ts$/, "")}`;
      exports[exportName] = `./${file}`;
    }
  }

  return exports;
}

/**
 * Prompt user for JSR package configuration
 */
export async function promptJsrConfig(
  defaults: Partial<JsrPackageConfig>,
  existingConfig?: JsrPackageConfig,
  path: string = Deno.cwd(),
): Promise<Result<JsrPackageConfig>> {
  try {
    const config: JsrPackageConfig = {
      name: "",
      version: "",
    };

    // Scope
    let scope = "";
    let packageName = "";

    if (existingConfig?.name) {
      const match = existingConfig.name.match(/^(@[^/]+)\/(.+)$/);
      if (match) {
        scope = match[1];
        packageName = match[2];
      }
    } else if (defaults.name) {
      const match = defaults.name.match(/^(@[^/]+)\/(.+)$/);
      if (match) {
        scope = match[1];
        packageName = match[2];
      }
    }

    scope = await Input.prompt({
      message: "Scope (must start with @):",
      default: scope || "@scope",
      validate: (value) => {
        if (!value.startsWith("@")) {
          return "Scope must start with @";
        }
        if (!/^@[a-z0-9-]+$/.test(value)) {
          return "Scope must contain only lowercase letters, numbers, and hyphens";
        }
        return true;
      },
    });

    // Package name
    packageName = await Input.prompt({
      message: "Package name:",
      default: packageName || defaults.name?.split("/")[1] || "",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Package name is required";
        }
        if (!/^[a-z0-9-]+$/.test(value)) {
          return "Package name must contain only lowercase letters, numbers, and hyphens";
        }
        return true;
      },
    });

    config.name = `${scope}/${packageName}`;

    console.log(`\n✓ Full package name: ${config.name}\n`);

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

    // Entry point / exports
    const hasMultipleExports = await Confirm.prompt({
      message: "Do you have multiple entry points (exports map)?",
      default: typeof existingConfig?.exports === "object",
    });

    if (hasMultipleExports) {
      const suggestedExports = await suggestExports(path);
      const exportsMap: Record<string, string> = {};

      if (Object.keys(suggestedExports).length > 0) {
        console.log("\nDetected entry points:");
        Object.entries(suggestedExports).forEach(([key, value]) => {
          console.log(`  ${key} → ${value}`);
        });

        const useSuggested = await Confirm.prompt({
          message: "Use detected entry points?",
          default: true,
        });

        if (useSuggested) {
          Object.assign(exportsMap, suggestedExports);
        }
      }

      // Allow adding custom exports
      const addCustom = await Confirm.prompt({
        message: "Add custom entry points?",
        default: false,
      });

      if (addCustom) {
        let addMore = true;
        while (addMore) {
          const exportName = await Input.prompt({
            message: "Export name (e.g., . or ./utils):",
            validate: (value) => value.trim().length > 0 || "Export name is required",
          });

          const exportPath = await Input.prompt({
            message: "Export path (e.g., ./mod.ts):",
            validate: (value) => value.trim().length > 0 || "Export path is required",
          });

          exportsMap[exportName] = exportPath;

          addMore = await Confirm.prompt({
            message: "Add another export?",
            default: false,
          });
        }
      }

      config.exports = exportsMap;
    } else {
      // Single entry point
      const entryPoint = await Input.prompt({
        message: "Entry point:",
        default: typeof existingConfig?.exports === "string"
          ? existingConfig.exports
          : (defaults.exports as string) || "./mod.ts",
      });
      config.exports = entryPoint;
    }

    // License
    config.license = await Input.prompt({
      message: "License:",
      default: existingConfig?.license || defaults.license || "MIT",
    });

    // Repository (from defaults if available)
    if (defaults.repository) {
      config.repository = defaults.repository;
    }

    return Ok(config);
  } catch (error) {
    return Err(
      new PublishError(
        "JSR configuration cancelled",
        "JSR_CONFIG_CANCELLED",
        error,
      ),
    );
  }
}

/**
 * Create deno.json file
 */
export async function createDenoJson(
  config: JsrPackageConfig,
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  const denoJsonPath = join(path, "deno.json");

  try {
    logger?.info("Creating deno.json...");

    // Generate deno.json content
    const content = JSON.stringify(config, null, 2) + "\n";

    await Deno.writeTextFile(denoJsonPath, content);
    logger?.success("deno.json created");

    return Ok(undefined);
  } catch (error) {
    return Err(
      new PublishError(
        "Failed to create deno.json",
        "JSR_CREATE_FAILED",
        error,
      ),
    );
  }
}

/**
 * Update existing deno.json file
 */
export async function updateDenoJson(
  config: JsrPackageConfig,
  path: string = Deno.cwd(),
  logger?: Logger,
): Promise<Result<void>> {
  return createDenoJson(config, path, logger);
}

/**
 * Validate JSR configuration
 */
export async function validateJsrConfig(
  config: JsrPackageConfig,
  path: string = Deno.cwd(),
): Promise<Result<boolean>> {
  // Check required fields
  if (!config.name || config.name.trim().length === 0) {
    return Err(
      new PublishError("Package name is required", "JSR_VALIDATION_FAILED"),
    );
  }

  // Validate @scope/name format
  if (!/^@[a-z0-9-]+\/[a-z0-9-]+$/.test(config.name)) {
    return Err(
      new PublishError(
        "Invalid JSR package name format. Must be @scope/name",
        "JSR_VALIDATION_FAILED",
      ),
    );
  }

  if (!config.version || config.version.trim().length === 0) {
    return Err(
      new PublishError("Version is required", "JSR_VALIDATION_FAILED"),
    );
  }

  // Validate semver
  if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(config.version)) {
    return Err(
      new PublishError("Invalid semver version", "JSR_VALIDATION_FAILED"),
    );
  }

  // Validate exports exist
  if (!config.exports) {
    return Err(
      new PublishError(
        "Exports field is required for JSR",
        "JSR_VALIDATION_FAILED",
      ),
    );
  }

  // Check if exported files exist
  const exportsToCheck: string[] = [];
  if (typeof config.exports === "string") {
    exportsToCheck.push(config.exports);
  } else {
    exportsToCheck.push(...Object.values(config.exports));
  }

  for (const exportPath of exportsToCheck) {
    const cleanPath = exportPath.replace(/^\.\//, "");
    const fullPath = join(path, cleanPath);
    if (!await exists(fullPath)) {
      return Err(
        new PublishError(
          `Export file not found: ${exportPath}`,
          "JSR_VALIDATION_FAILED",
        ),
      );
    }
  }

  return Ok(true);
}
