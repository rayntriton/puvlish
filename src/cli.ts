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
