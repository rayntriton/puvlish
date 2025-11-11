/**
 * JSR configuration validator and helper module
 */

import { exists } from "@std/fs";
import { join } from "@std/path";
import { Confirm, Input } from "@cliffy/prompt";
import { Err, Logger, Ok, PublishError, Result } from "./utils.ts";

export interface JsrValidation {
  isValid: boolean;
  hasConfig: boolean;
  hasName: boolean;
  hasValidName: boolean; // @scope/package format
  hasVersion: boolean;
  hasValidVersion: boolean; // semver format
  hasExports: boolean;
  hasLicense: boolean;
  currentConfig?: DenoConfig;
  issues: string[];
  suggestions: string[];
}

export interface DenoConfig {
  name?: string;
  version?: string;
  exports?: string | Record<string, string>;
  license?: string;
  description?: string;
  repository?: string | Record<string, string>;
  [key: string]: unknown;
}

/**
 * Read deno.json configuration
 */
async function readDenoConfig(path: string): Promise<Result<DenoConfig>> {
  const denoJsonPath = join(path, "deno.json");

  if (!await exists(denoJsonPath)) {
    return Err(
      new PublishError("deno.json not found", "DENO_JSON_NOT_FOUND"),
    );
  }

  try {
    const content = await Deno.readTextFile(denoJsonPath);
    const config = JSON.parse(content);
    return Ok(config as DenoConfig);
  } catch (error) {
    return Err(
      new PublishError(
        "Failed to parse deno.json",
        "DENO_JSON_PARSE_ERROR",
        error,
      ),
    );
  }
}

/**
 * Write deno.json configuration
 */
async function writeDenoConfig(
  path: string,
  config: DenoConfig,
): Promise<Result<void>> {
  const denoJsonPath = join(path, "deno.json");

  try {
    const content = JSON.stringify(config, null, 2) + "\n";
    await Deno.writeTextFile(denoJsonPath, content);
    return Ok(undefined);
  } catch (error) {
    return Err(
      new PublishError(
        "Failed to write deno.json",
        "DENO_JSON_WRITE_ERROR",
        error,
      ),
    );
  }
}

/**
 * Validate JSR package name format (@scope/package)
 */
function validateJsrName(name: string): boolean {
  return /^@[a-z0-9-]+\/[a-z0-9-]+$/.test(name);
}

/**
 * Validate semver version format
 */
function validateSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(version);
}

/**
 * Validate JSR configuration
 */
export async function validateJsrConfig(
  path: string = Deno.cwd(),
): Promise<Result<JsrValidation>> {
  const validation: JsrValidation = {
    isValid: false,
    hasConfig: false,
    hasName: false,
    hasValidName: false,
    hasVersion: false,
    hasValidVersion: false,
    hasExports: false,
    hasLicense: false,
    issues: [],
    suggestions: [],
  };

  // Check if deno.json exists
  const configResult = await readDenoConfig(path);

  if (!configResult.ok) {
    validation.issues.push("deno.json file not found");
    validation.suggestions.push("Create a deno.json file for JSR publishing");
    return Ok(validation);
  }

  validation.hasConfig = true;
  validation.currentConfig = configResult.value;
  const config = configResult.value;

  // Validate name
  if (!config.name) {
    validation.issues.push("Missing 'name' field");
    validation.suggestions.push(
      "Add 'name' field in format: @scope/package-name",
    );
  } else {
    validation.hasName = true;

    if (!validateJsrName(config.name)) {
      validation.issues.push(
        `Invalid name format: ${config.name}. Must be @scope/package`,
      );
      validation.suggestions.push(
        "Use format: @your-username/package-name (all lowercase, hyphens allowed)",
      );
    } else {
      validation.hasValidName = true;
    }
  }

  // Validate version
  if (!config.version) {
    validation.issues.push("Missing 'version' field");
    validation.suggestions.push("Add 'version' field (e.g., '0.1.0')");
  } else {
    validation.hasVersion = true;

    if (!validateSemver(config.version)) {
      validation.issues.push(
        `Invalid version format: ${config.version}. Must be semver`,
      );
      validation.suggestions.push("Use semver format: MAJOR.MINOR.PATCH (e.g., '1.0.0')");
    } else {
      validation.hasValidVersion = true;
    }
  }

  // Validate exports
  if (!config.exports) {
    validation.issues.push("Missing 'exports' field");
    validation.suggestions.push("Add 'exports' field pointing to main file");
  } else {
    validation.hasExports = true;
  }

  // Check license (recommended but not required)
  if (!config.license) {
    validation.suggestions.push(
      "Consider adding 'license' field (e.g., 'MIT')",
    );
  } else {
    validation.hasLicense = true;
  }

  // Determine if valid overall
  validation.isValid = validation.hasValidName &&
    validation.hasValidVersion &&
    validation.hasExports;

  return Ok(validation);
}

/**
 * Prompt user for JSR scope
 */
async function promptJsrScope(): Promise<Result<string>> {
  try {
    const scope = await Input.prompt({
      message: "Enter your JSR scope (e.g., your-username):",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Scope is required";
        }
        if (!/^[a-z0-9-]+$/.test(value)) {
          return "Scope can only contain lowercase letters, numbers, and hyphens";
        }
        return true;
      },
      hint: "This will be used as @scope/package-name",
    });

    return Ok(scope.trim());
  } catch (error) {
    return Err(
      new PublishError("Scope prompt cancelled", "SCOPE_PROMPT_CANCELLED", error),
    );
  }
}

/**
 * Prompt user for package name
 */
async function promptPackageName(suggestedName: string): Promise<Result<string>> {
  try {
    const name = await Input.prompt({
      message: "Enter package name:",
      default: suggestedName,
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Package name is required";
        }
        if (!/^[a-z0-9-]+$/.test(value)) {
          return "Package name can only contain lowercase letters, numbers, and hyphens";
        }
        return true;
      },
    });

    return Ok(name.trim());
  } catch (error) {
    return Err(
      new PublishError(
        "Package name prompt cancelled",
        "NAME_PROMPT_CANCELLED",
        error,
      ),
    );
  }
}

/**
 * Auto-fix JSR configuration issues
 */
export async function autoFixJsrConfig(
  validation: JsrValidation,
  path: string = Deno.cwd(),
  logger: Logger,
): Promise<Result<void>> {
  if (validation.isValid) {
    logger.success("JSR configuration is already valid");
    return Ok(undefined);
  }

  logger.section("JSR Configuration Auto-Fix");

  logger.warn("The following issues were found:");
  validation.issues.forEach((issue) => logger.error(`  • ${issue}`));

  const shouldFix = await Confirm.prompt({
    message: "Would you like to fix these issues automatically?",
    default: true,
  });

  if (!shouldFix) {
    return Err(
      new PublishError("User declined auto-fix", "AUTO_FIX_DECLINED"),
    );
  }

  // Get current config or create new one
  let config: DenoConfig = validation.currentConfig || {};

  // Fix name if needed
  if (!validation.hasValidName) {
    logger.info("Configuring package name...");

    const scopeResult = await promptJsrScope();
    if (!scopeResult.ok) return Err(scopeResult.error);

    const scope = scopeResult.value;
    const suggestedPkgName = config.name?.split("/")[1] ||
      basename(path).toLowerCase().replace(/[^a-z0-9-]/g, "-");

    const pkgNameResult = await promptPackageName(suggestedPkgName);
    if (!pkgNameResult.ok) return Err(pkgNameResult.error);

    const pkgName = pkgNameResult.value;
    config.name = `@${scope}/${pkgName}`;
    logger.success(`Package name set to: ${config.name}`);
  }

  // Fix version if needed
  if (!validation.hasValidVersion) {
    config.version = "0.1.0";
    logger.success("Version set to: 0.1.0");
  }

  // Fix exports if needed
  if (!validation.hasExports) {
    // Try to detect main file
    const mainFiles = ["mod.ts", "index.ts", "main.ts", "src/mod.ts"];

    let foundMain: string | undefined;
    for (const file of mainFiles) {
      if (await exists(join(path, file))) {
        foundMain = file;
        break;
      }
    }

    if (foundMain) {
      config.exports = `./${foundMain}`;
      logger.success(`Exports set to: ${config.exports}`);
    } else {
      logger.warn(
        "No main file detected. Please set 'exports' manually in deno.json",
      );
      config.exports = "./mod.ts";
    }
  }

  // Add license if missing (recommended)
  if (!validation.hasLicense) {
    const addLicense = await Confirm.prompt({
      message: "Add MIT license to deno.json?",
      default: true,
    });

    if (addLicense) {
      config.license = "MIT";
      logger.success("License set to: MIT");
    }
  }

  // Write updated config
  const writeResult = await writeDenoConfig(path, config);
  if (!writeResult.ok) return Err(writeResult.error);

  logger.success("deno.json updated successfully!");
  return Ok(undefined);
}

/**
 * Get current directory basename (for suggestions)
 */
function basename(path: string): string {
  return path.split("/").filter(Boolean).pop() || "package";
}
