#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run --allow-env

/**
 * CLI entry point for publishjs
 */

import { Command } from "@cliffy/command";
import { publish, PublishOptions } from "./publisher.ts";
import { Logger } from "./utils.ts";

const VERSION = "0.1.0";

async function main() {
  const command = new Command()
    .name("publishjs")
    .version(VERSION)
    .description(
      "Automate Git and package publishing workflows with interactive prompts",
    )
    .example(
      "Interactive mode",
      "publishjs",
    )
    .example(
      "Publish a specific branch",
      "publishjs --branch main",
    )
    .example(
      "Publish a specific tag",
      "publishjs --tag v1.0.0",
    )
    .example(
      "Create and publish a new tag",
      "publishjs --create-tag v1.0.1",
    )
    .example(
      "Dry run (no changes)",
      "publishjs --dry-run",
    )
    .option(
      "-b, --branch <branch:string>",
      "Publish a specific branch",
    )
    .option(
      "-t, --tag <tag:string>",
      "Publish a specific tag",
    )
    .option(
      "-c, --create-tag <tag:string>",
      "Create and publish a new tag",
    )
    .option(
      "-r, --remote <remote:string>",
      "Remote name to push to",
      { default: "origin" },
    )
    .option(
      "--skip-registries",
      "Skip publishing to package registries (npm/jsr)",
      { default: false },
    )
    .option(
      "--registry <registries...:string>",
      "Specific registries to publish to (npm, jsr)",
    )
    .option(
      "-f, --force",
      "Force push (use with caution)",
      { default: false },
    )
    .option(
      "-d, --dry-run",
      "Show what would be done without making changes",
      { default: false },
    )
    .option(
      "-v, --verbose",
      "Enable verbose logging",
      { default: false },
    )
    .action(async (options) => {
      const logger = new Logger(options.verbose);

      // Validate options
      const mutuallyExclusive = [
        options.branch,
        options.tag,
        options.createTag,
      ].filter(Boolean);

      if (mutuallyExclusive.length > 1) {
        logger.error(
          "Options --branch, --tag, and --create-tag are mutually exclusive",
        );
        Deno.exit(1);
      }

      // Build publish options
      const publishOptions: PublishOptions = {
        branch: options.branch,
        tag: options.tag,
        createTag: options.createTag,
        remote: options.remote,
        skipRegistries: options.skipRegistries,
        registries: options.registry,
        force: options.force,
        dryRun: options.dryRun,
        verbose: options.verbose,
      };

      // Display welcome message
      console.log(`\n📦 publishjs v${VERSION}\n`);

      // Execute publish workflow
      const result = await publish(publishOptions);

      if (!result.ok) {
        logger.error(`Publish failed: ${result.error.message}`);

        if (options.verbose && result.error instanceof Error) {
          logger.debug(`Error details: ${result.error.stack}`);
        }

        Deno.exit(1);
      }

      logger.success("\n🎉 All done!");
      Deno.exit(0);
    });

  // Add a check command for diagnostics
  command
    .command("check")
    .description("Check your setup (Git, remotes, authentication, registries)")
    .option("-v, --verbose", "Enable verbose logging", { default: false })
    .action(async (options) => {
      const logger = new Logger(options.verbose);

      console.log(`\n🔍 publishjs setup check v${VERSION}\n`);

      const { isGitInstalled, getGitStatus } = await import("./git.ts");
      const { getPrimaryRemote } = await import("./remote.ts");
      const { detectRegistries } = await import("./registry.ts");
      const { verifyAuth } = await import("./auth.ts");

      // Check Git
      logger.section("Git");
      const gitInstalled = await isGitInstalled();
      if (gitInstalled) {
        logger.success("Git is installed");

        const statusResult = await getGitStatus();
        if (statusResult.ok) {
          const status = statusResult.value;
          if (status.isRepo) {
            logger.success("Current directory is a Git repository");
            if (status.currentBranch) {
              logger.info(`Current branch: ${status.currentBranch}`);
            }
            logger.info(
              `Working directory: ${status.isDirty ? "dirty" : "clean"}`,
            );
          } else {
            logger.warn("Not a Git repository");
          }
        }
      } else {
        logger.error("Git is not installed");
      }

      // Check Remote
      logger.section("Remote Repository");
      const remoteResult = await getPrimaryRemote();
      if (remoteResult.ok) {
        const remote = remoteResult.value;
        logger.success(`Remote: ${remote.name}`);
        logger.info(`URL: ${remote.url}`);
        logger.info(`Platform: ${remote.platform}`);
        if (remote.owner && remote.repo) {
          logger.info(`Repository: ${remote.owner}/${remote.repo}`);
        }

        // Check Auth
        logger.section("Authentication");
        const authResult = await verifyAuth(
          remote.url,
          remote.platform,
          "origin",
          Deno.cwd(),
          logger,
        );
        if (authResult.ok) {
          logger.success("Authentication verified");
        } else {
          logger.warn("Authentication check failed");
        }
      } else {
        logger.warn("No remote repository configured");
      }

      // Check Registries
      logger.section("Package Registries");
      const registries = await detectRegistries();
      if (registries.length > 0) {
        registries.forEach((reg) => {
          logger.success(`${reg.registry}: ${reg.name}@${reg.version}`);
        });
      } else {
        logger.info("No package registries detected (npm/jsr)");
      }

      console.log("\n✅ Setup check complete\n");
    });

  // Add init command for guided setup
  command
    .command("init")
    .description("Initialize project for publishing (guided setup)")
    .option("-v, --verbose", "Enable verbose logging", { default: false })
    .action(async (options) => {
      const logger = new Logger(options.verbose);

      console.log(`\n🚀 publishjs init v${VERSION}\n`);
      logger.info("This wizard will help you set up your project for publishing.\n");

      const { autoInitializeGit, needsGitInit } = await import("./auto_init.ts");
      const { autoCreateRemote, needsRemoteSetup } = await import("./auto_remote.ts");
      const { validateJsrConfig, autoFixJsrConfig } = await import("./jsr_validator.ts");
      const { displayJsrTokenStatus } = await import("./jsr_auth.ts");
      const { isGitInstalled } = await import("./git.ts");

      const path = Deno.cwd();

      // Step 1: Check Git installation
      logger.section("Step 1: Git Setup");
      const gitInstalled = await isGitInstalled();

      if (!gitInstalled) {
        logger.error("Git is not installed");
        logger.info("Please install Git from: https://git-scm.com/downloads");
        logger.info("Run 'publishjs init' again after installing Git");
        Deno.exit(1);
      }

      logger.success("Git is installed");

      // Step 2: Initialize Git repository if needed
      if (await needsGitInit(path)) {
        const initResult = await autoInitializeGit(path, logger);
        if (!initResult.ok) {
          logger.error(`Failed to initialize Git: ${initResult.error.message}`);
          Deno.exit(1);
        }
      } else {
        logger.success("Git repository already initialized");
      }

      // Step 3: Setup remote repository
      logger.section("Step 2: Remote Repository Setup");

      if (await needsRemoteSetup(path)) {
        const remoteResult = await autoCreateRemote(path, logger);
        if (!remoteResult.ok) {
          const error = remoteResult.error;
          const { PublishError } = await import("./utils.ts");
          if (!(error instanceof PublishError && error.code === "REPO_CREATE_DECLINED")) {
            logger.error(`Failed to setup remote: ${error.message}`);
            Deno.exit(1);
          }
          logger.info("Skipping remote setup");
        }
      } else {
        logger.success("Remote repository already configured");
      }

      // Step 4: Check package registries
      logger.section("Step 3: Package Registry Configuration");

      const { detectRegistries } = await import("./registry.ts");
      const registries = await detectRegistries(path);

      if (registries.length === 0) {
        logger.info("No package registries detected");
        logger.info("Add package.json for npm or deno.json for JSR");
      } else {
        registries.forEach((reg) => {
          logger.success(`Found ${reg.registry}: ${reg.name}@${reg.version}`);
        });

        // Validate JSR if detected
        const hasJsr = registries.some((r) => r.registry === "jsr");

        if (hasJsr) {
          logger.section("Step 4: JSR Configuration");

          const jsrValidationResult = await validateJsrConfig(path);

          if (jsrValidationResult.ok) {
            const validation = jsrValidationResult.value;

            if (!validation.isValid) {
              logger.warn("JSR configuration has issues");
              const fixResult = await autoFixJsrConfig(validation, path, logger);

              if (!fixResult.ok) {
                logger.warn("JSR configuration not fixed");
              }
            } else {
              logger.success("JSR configuration is valid");
            }
          }

          // Check JSR token
          logger.section("Step 5: JSR Authentication");
          displayJsrTokenStatus(logger);
        }
      }

      // Final summary
      logger.section("✅ Setup Complete");
      logger.success("Your project is ready for publishing!");
      logger.info("\nNext steps:");
      logger.info("  1. Run 'publishjs check' to verify your setup");
      logger.info("  2. Run 'publishjs' to publish your project");

      console.log();
    });

  try {
    await command.parse(Deno.args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    Deno.exit(1);
  }
}

// Run the CLI
if (import.meta.main) {
  await main();
}
