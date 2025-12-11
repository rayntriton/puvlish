/**
 * Package configuration wizard
 */

import { Checkbox, Confirm, Select } from "@cliffy/prompt";
import { exists } from "@std/fs";
import { join } from "@std/path";
import {
  createPackageJson,
  getNpmDefaults,
  NpmPackageConfig,
  packageJsonExists,
  promptNpmConfig,
  readPackageJson,
  validateNpmConfig,
} from "./npm_config.ts";
import {
  createDenoJson,
  denoJsonExists,
  getJsrDefaults,
  JsrPackageConfig,
  promptJsrConfig,
  readDenoJson,
  validateJsrConfig,
} from "./jsr_config.ts";
import { Err, Logger, Ok, PublishError, Result } from "./utils.ts";

export interface PackageWizardOptions {
  registry?: string[]; // ['npm', 'jsr']
  verbose?: boolean;
  dryRun?: boolean;
}

export interface ExistingConfig {
  hasPackageJson: boolean;
  hasDenoJson: boolean;
  packageJson?: NpmPackageConfig;
  denoJson?: JsrPackageConfig;
}

/**
 * Detect existing package configuration
 */
async function detectExistingConfig(
  path: string,
  logger: Logger,
): Promise<ExistingConfig> {
  logger.section("🔍 Detecting existing configuration");

  const hasPackageJson = await packageJsonExists(path);
  const hasDenoJson = await denoJsonExists(path);

  const config: ExistingConfig = {
    hasPackageJson,
    hasDenoJson,
  };

  if (hasPackageJson) {
    const result = await readPackageJson(path);
    if (result.ok) {
      config.packageJson = result.value;
      logger.success(`Found package.json: ${result.value.name}@${result.value.version}`);
    } else {
      logger.warn("Found package.json but failed to read it");
    }
  }

  if (hasDenoJson) {
    const result = await readDenoJson(path);
    if (result.ok) {
      config.denoJson = result.value;
      logger.success(`Found deno.json: ${result.value.name}@${result.value.version}`);
    } else {
      logger.warn("Found deno.json but failed to read it");
    }
  }

  if (!hasPackageJson && !hasDenoJson) {
    logger.info("No package configuration found");
  }

  return config;
}

/**
 * Prompt user to select registries
 */
async function promptRegistrySelection(
  existingConfig: ExistingConfig,
  preselected?: string[],
): Promise<Result<string[]>> {
  if (preselected && preselected.length > 0) {
    return Ok(preselected);
  }

  try {
    const options = [
      { name: "npm", value: "npm" },
      { name: "JSR (JavaScript Registry)", value: "jsr" },
    ];

    // Pre-select based on existing config
    const defaults: string[] = [];
    if (existingConfig.hasPackageJson) defaults.push("npm");
    if (existingConfig.hasDenoJson) defaults.push("jsr");

    const selected = await Checkbox.prompt({
      message: "Which package registries do you want to configure?",
      options,
      default: defaults.length > 0 ? defaults : undefined,
      minOptions: 1,
    });

    if (selected.length === 0) {
      return Err(
        new PublishError(
          "At least one registry must be selected",
          "NO_REGISTRY_SELECTED",
        ),
      );
    }

    return Ok(selected);
  } catch (error) {
    return Err(
      new PublishError(
        "Registry selection cancelled",
        "REGISTRY_SELECTION_CANCELLED",
        error,
      ),
    );
  }
}

/**
 * Configure npm package
 */
async function configureNpm(
  existingConfig: ExistingConfig,
  path: string,
  logger: Logger,
  dryRun: boolean,
): Promise<Result<void>> {
  logger.section("📦 Configuring npm package");

  // Get defaults
  const defaults = await getNpmDefaults(path);

  // If exists, ask if want to update
  if (existingConfig.hasPackageJson && existingConfig.packageJson) {
    logger.info(`Current configuration: ${existingConfig.packageJson.name}@${existingConfig.packageJson.version}`);

    const shouldUpdate = await Confirm.prompt({
      message: "Do you want to update the existing package.json?",
      default: false,
    });

    if (!shouldUpdate) {
      logger.info("Keeping existing package.json");
      return Ok(undefined);
    }
  }

  // Prompt for configuration
  const configResult = await promptNpmConfig(defaults, existingConfig.packageJson);
  if (!configResult.ok) return Err(configResult.error);

  const config = configResult.value;

  // Validate
  const validationResult = validateNpmConfig(config);
  if (!validationResult.ok) return Err(validationResult.error);

  // Show summary
  logger.info("\n📝 npm package configuration:");
  logger.info(`   Name: ${config.name}`);
  logger.info(`   Version: ${config.version}`);
  logger.info(`   Entry: ${config.main}`);
  if (config.description) logger.info(`   Description: ${config.description}`);
  logger.info(`   Access: ${config.private ? "private" : "public"}`);
  if (config.author) logger.info(`   Author: ${config.author}`);
  if (config.license) logger.info(`   License: ${config.license}`);

  if (dryRun) {
    logger.info("\n🏃 Dry run - package.json would be created/updated");
    return Ok(undefined);
  }

  // Create or update package.json
  const createResult = await createPackageJson(config, path, logger);
  if (!createResult.ok) return Err(createResult.error);

  return Ok(undefined);
}

/**
 * Configure JSR package
 */
async function configureJsr(
  existingConfig: ExistingConfig,
  path: string,
  logger: Logger,
  dryRun: boolean,
): Promise<Result<void>> {
  logger.section("🦕 Configuring JSR package");

  // Get defaults
  const defaults = await getJsrDefaults(path);

  // If exists, ask if want to update
  if (existingConfig.hasDenoJson && existingConfig.denoJson) {
    logger.info(`Current configuration: ${existingConfig.denoJson.name}@${existingConfig.denoJson.version}`);

    const shouldUpdate = await Confirm.prompt({
      message: "Do you want to update the existing deno.json?",
      default: false,
    });

    if (!shouldUpdate) {
      logger.info("Keeping existing deno.json");
      return Ok(undefined);
    }
  }

  // Prompt for configuration
  const configResult = await promptJsrConfig(defaults, existingConfig.denoJson, path);
  if (!configResult.ok) return Err(configResult.error);

  const config = configResult.value;

  // Show summary
  logger.info("\n📝 JSR package configuration:");
  logger.info(`   Name: ${config.name}`);
  logger.info(`   Version: ${config.version}`);
  if (typeof config.exports === "string") {
    logger.info(`   Entry: ${config.exports}`);
  } else if (config.exports) {
    logger.info(`   Exports:`);
    Object.entries(config.exports).forEach(([key, value]) => {
      logger.info(`     ${key} → ${value}`);
    });
  }
  if (config.license) logger.info(`   License: ${config.license}`);

  if (dryRun) {
    logger.info("\n🏃 Dry run - deno.json would be created/updated");
    return Ok(undefined);
  }

  // Validate (before creating)
  const validationResult = await validateJsrConfig(config, path);
  if (!validationResult.ok) {
    // If validation fails due to missing files, offer to create them
    const error = validationResult.error;
    if (error instanceof PublishError &&
        error.code === "JSR_VALIDATION_FAILED" &&
        error.message.includes("Export file not found")) {
      logger.warn(error.message);

      const shouldCreate = await Confirm.prompt({
        message: "Would you like to create the missing entry point file?",
        default: true,
      });

      if (shouldCreate) {
        await createEntryPointTemplate(config, path, logger);
      } else {
        return Err(error);
      }
    } else {
      return Err(error);
    }
  }

  // Create or update deno.json
  const createResult = await createDenoJson(config, path, logger);
  if (!createResult.ok) return Err(createResult.error);

  return Ok(undefined);
}

/**
 * Create entry point template file
 */
async function createEntryPointTemplate(
  config: JsrPackageConfig,
  path: string,
  logger: Logger,
): Promise<void> {
  const entryPoints: string[] = [];

  if (typeof config.exports === "string") {
    entryPoints.push(config.exports);
  } else if (config.exports) {
    entryPoints.push(...Object.values(config.exports));
  }

  for (const exportPath of entryPoints) {
    const cleanPath = exportPath.replace(/^\.\//, "");
    const fullPath = join(path, cleanPath);

    if (await exists(fullPath)) {
      continue;
    }

    // Extract package name without scope
    const packageName = config.name.split("/")[1];

    const template = `/**
 * @module ${config.name}
 *
 * @description
 * Main entry point for ${packageName}
 *
 * @example
 * \`\`\`typescript
 * import { example } from "${config.name}";
 *
 * example();
 * \`\`\`
 */

export function example() {
  console.log("Hello from ${packageName}!");
}
`;

    try {
      await Deno.writeTextFile(fullPath, template);
      logger.success(`Created ${cleanPath} with template`);
    } catch (error) {
      logger.warn(`Failed to create ${cleanPath}: ${error}`);
    }
  }
}

/**
 * Display authentication setup instructions
 */
function displayAuthInstructions(registries: string[], logger: Logger): void {
  logger.section("🔐 Authentication Setup");

  if (registries.includes("npm")) {
    logger.info("\nFor npm:");
    logger.info("  Option 1: Use npm login:");
    logger.info("    $ npm login");
    logger.info("");
    logger.info("  Option 2: Set NPM_TOKEN environment variable (recommended for CI/CD):");
    logger.info("    1. Create a token at: https://www.npmjs.com/settings/~/tokens");
    logger.info("    2. Set the environment variable:");
    logger.info("       $ export NPM_TOKEN=npm_your_token_here");
    logger.info("");
    logger.info("  Option 3: Configure token manually:");
    logger.info("    $ npm config set //registry.npmjs.org/:_authToken <your-token>");
  }

  if (registries.includes("jsr")) {
    logger.info("\nFor JSR:");
    logger.info("  1. Create a token at: https://jsr.io/account/tokens");
    logger.info("  2. Set the environment variable:");
    logger.info("     $ export JSR_TOKEN=jsrp_your_token_here");
    logger.info("");
    logger.info("  You can also add it to your shell profile (.bashrc, .zshrc, etc.)");
  }
}

/**
 * Run package configuration wizard
 */
export async function runPackageWizard(
  options: PackageWizardOptions,
  path: string = Deno.cwd(),
): Promise<Result<void>> {
  const logger = new Logger(options.verbose);

  try {
    console.log("\n📦 Package Configuration Wizard\n");

    // Step 1: Detect existing configuration
    const existingConfig = await detectExistingConfig(path, logger);

    // Step 2: Select registries
    const registriesResult = await promptRegistrySelection(existingConfig, options.registry);
    if (!registriesResult.ok) return Err(registriesResult.error);

    const selectedRegistries = registriesResult.value;

    logger.info(`\nConfiguring for: ${selectedRegistries.join(", ")}\n`);

    // Step 3: Configure npm (if selected)
    if (selectedRegistries.includes("npm")) {
      const npmResult = await configureNpm(existingConfig, path, logger, options.dryRun || false);
      if (!npmResult.ok) return Err(npmResult.error);
    }

    // Step 4: Configure JSR (if selected)
    if (selectedRegistries.includes("jsr")) {
      const jsrResult = await configureJsr(existingConfig, path, logger, options.dryRun || false);
      if (!jsrResult.ok) return Err(jsrResult.error);
    }

    // Step 5: Authentication instructions
    displayAuthInstructions(selectedRegistries, logger);

    // Step 6: Success message
    logger.section("✅ Configuration complete!");

    if (options.dryRun) {
      logger.info("\n🏃 Dry run completed - no files were modified");
    } else {
      logger.info("\nYour package is now configured for publishing!");
      logger.info("\nNext steps:");
      logger.info("  1. Review your configuration files");
      logger.info("  2. Set up authentication (see instructions above)");
      logger.info("  3. Run: publishjs --verbose");
      logger.info("  4. Your package will be published!");
    }

    return Ok(undefined);
  } catch (error) {
    return Err(
      new PublishError(
        "Package wizard failed",
        "PACKAGE_WIZARD_FAILED",
        error,
      ),
    );
  }
}
