/**
 * Main publisher orchestration module for publishjs
 */

import { verifyAuth } from "./auth.ts";
import { autoCommitChanges, hasUncommittedChanges } from "./auto_commit.ts";
import { autoInitializeGit, needsGitInit } from "./auto_init.ts";
import { autoCreateRemote, needsRemoteSetup } from "./auto_remote.ts";
import {
  createTag,
  getBranches,
  getGitStatus,
  getTags,
  isGitInstalled,
  push,
} from "./git.ts";
import {
  promptConfirmPublish,
  promptCreateTag,
  promptPublishType,
  promptSelectBranch,
  promptSelectRegistries,
  promptSelectTag,
} from "./interactive.ts";
import { autoFixJsrConfig, validateJsrConfig } from "./jsr_validator.ts";
import { verifyJsrAuth } from "./jsr_auth.ts";
import {
  getPrimaryRemote,
  RemoteInfo,
} from "./remote.ts";
import {
  detectRegistries,
  getRegistryName,
  PackageInfo,
  publishToRegistry,
  RegistryType,
} from "./registry.ts";
import { Err, Logger, Ok, PublishError, Result } from "./utils.ts";

export interface PublishOptions {
  branch?: string;
  tag?: string;
  createTag?: string;
  remote?: string;
  skipRegistries?: boolean;
  registries?: string[];
  force?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

export interface PublishContext {
  gitRef: string; // Branch or tag to publish
  remote: RemoteInfo;
  registries: PackageInfo[];
  selectedRegistries: RegistryType[];
}

/**
 * Main publish workflow
 */
export async function publish(
  options: PublishOptions,
  path: string = Deno.cwd(),
): Promise<Result<void>> {
  const logger = new Logger(options.verbose);

  try {
    // Phase 1: Verify Git
    logger.section("🔍 Checking Git setup");
    const gitResult = await verifyGitSetup(path, logger);
    if (!gitResult.ok) return Err(gitResult.error);

    // Phase 2: Verify Remote (auto-create if needed)
    logger.section("🌐 Checking remote repository");

    let remote: RemoteInfo;

    if (await needsRemoteSetup(path)) {
      const autoRemoteResult = await autoCreateRemote(path, logger);
      if (!autoRemoteResult.ok) {
        return Err(autoRemoteResult.error);
      }

      // Get remote info after creation
      const remoteResult = await getPrimaryRemote(path);
      if (!remoteResult.ok) {
        return Err(remoteResult.error);
      }
      remote = remoteResult.value;
    } else {
      const remoteResult = await getPrimaryRemote(path);
      if (!remoteResult.ok) {
        return Err(remoteResult.error);
      }
      remote = remoteResult.value;
      logger.success(`Remote: ${remote.name} (${remote.platform})`);
    }

    // Phase 3: Verify Authentication
    logger.section("🔐 Verifying authentication");
    const authResult = await verifyAuth(
      remote.url,
      remote.platform,
      options.remote || "origin",
      path,
      logger,
    );
    if (!authResult.ok) return Err(authResult.error);
    logger.success("Authentication verified");

    // Phase 4: Check for uncommitted changes
    if (await hasUncommittedChanges(path)) {
      const commitResult = await autoCommitChanges(path, logger);
      if (!commitResult.ok) {
        const error = commitResult.error;
        if (error instanceof PublishError && error.code === "COMMIT_DECLINED") {
          logger.warn("Proceeding with uncommitted changes");
        } else {
          return Err(error);
        }
      }
    }

    // Phase 5: Determine what to publish
    logger.section("📦 Determining what to publish");
    const refResult = await determineGitRef(options, path, logger);
    if (!refResult.ok) return Err(refResult.error);
    const gitRef = refResult.value;
    logger.success(`Publishing: ${gitRef}`);

    // Phase 6: Detect registries
    logger.section("📚 Detecting package registries");
    const registries = await detectRegistries(path);
    if (registries.length > 0) {
      registries.forEach((reg) => {
        logger.info(
          `Found ${getRegistryName(reg.registry)}: ${reg.name}@${reg.version}`,
        );
      });
    } else {
      logger.info("No package registries detected (npm/jsr)");
    }

    // Phase 7: Select registries to publish to
    let selectedRegistries: RegistryType[] = [];
    if (!options.skipRegistries && registries.length > 0) {
      const availableRegistries = registries.map((r) =>
        getRegistryName(r.registry)
      );
      const selectedResult = await promptSelectRegistries(availableRegistries);
      if (!selectedResult.ok) return Err(selectedResult.error);

      selectedRegistries = selectedResult.value.map((name) =>
        name === "npm" ? RegistryType.NPM : RegistryType.JSR
      );
    }

    // Phase 8: Validate JSR configuration if publishing to JSR
    if (selectedRegistries.includes(RegistryType.JSR)) {
      logger.section("🔍 Validating JSR configuration");

      const jsrValidationResult = await validateJsrConfig(path);
      if (!jsrValidationResult.ok) {
        return Err(jsrValidationResult.error);
      }

      const jsrValidation = jsrValidationResult.value;

      if (!jsrValidation.isValid) {
        logger.warn("JSR configuration has issues");
        const fixResult = await autoFixJsrConfig(jsrValidation, path, logger);

        if (!fixResult.ok) {
          const error = fixResult.error;
          if (error instanceof PublishError && error.code === "AUTO_FIX_DECLINED") {
            logger.warn("Publishing to JSR skipped");
            selectedRegistries = selectedRegistries.filter((r) =>
              r !== RegistryType.JSR
            );
          } else {
            return Err(error);
          }
        } else {
          logger.success("JSR configuration fixed");
        }
      } else {
        logger.success("JSR configuration is valid");
      }

      // Verify JSR authentication
      if (selectedRegistries.includes(RegistryType.JSR)) {
        const jsrAuthResult = await verifyJsrAuth(logger);
        if (!jsrAuthResult.ok) {
          logger.warn("JSR authentication not configured");
          logger.info("Skipping JSR publishing");
          selectedRegistries = selectedRegistries.filter((r) =>
            r !== RegistryType.JSR
          );
        }
      }
    }

    // Phase 9: Confirm publish
    if (!options.dryRun) {
      const confirmed = await promptConfirmPublish(
        gitRef,
        remote.name,
        selectedRegistries.map(getRegistryName),
      );

      if (!confirmed) {
        logger.warn("Publish cancelled by user");
        return Ok(undefined);
      }
    }

    // Phase 10: Execute publish
    if (options.dryRun) {
      logger.info("🏃 Dry run - no changes will be made");
      logger.info(`Would push: ${gitRef} → ${remote.name}`);
      if (selectedRegistries.length > 0) {
        logger.info(
          `Would publish to: ${selectedRegistries.map(getRegistryName).join(", ")}`,
        );
      }
      return Ok(undefined);
    }

    logger.section("🚀 Publishing");

    // Push to Git
    const pushResult = await push(
      options.remote || "origin",
      gitRef,
      { force: options.force },
      path,
      logger,
    );
    if (!pushResult.ok) {
      return Err(pushResult.error);
    }

    // Publish to registries
    for (const registry of selectedRegistries) {
      const publishResult = await publishToRegistry(registry, path, logger);
      if (!publishResult.ok) {
        logger.error(
          `Failed to publish to ${getRegistryName(registry)}: ${publishResult.error.message}`,
        );
        // Continue with other registries even if one fails
      }
    }

    logger.section("✅ Publish complete");
    return Ok(undefined);
  } catch (error) {
    return Err(
      new PublishError(
        "Publish workflow failed",
        "PUBLISH_FAILED",
        error,
      ),
    );
  }
}

/**
 * Verify Git is installed and repository is initialized
 */
async function verifyGitSetup(
  path: string,
  logger: Logger,
): Promise<Result<void>> {
  // Check if Git is installed
  const gitInstalled = await isGitInstalled();
  if (!gitInstalled) {
    logger.error("Git is not installed or not available in PATH");
    logger.info("Please install Git: https://git-scm.com/downloads");
    return Err(
      new PublishError("Git not installed", "GIT_NOT_INSTALLED"),
    );
  }
  logger.success("Git is installed");

  // Check if it's a Git repository, auto-initialize if needed
  if (await needsGitInit(path)) {
    const initResult = await autoInitializeGit(path, logger);
    if (!initResult.ok) {
      return Err(initResult.error);
    }
  } else {
    logger.success("Git repository detected");
  }

  return Ok(undefined);
}

/**
 * Determine which Git ref (branch or tag) to publish
 */
async function determineGitRef(
  options: PublishOptions,
  path: string,
  logger: Logger,
): Promise<Result<string>> {
  // If branch is specified, use it
  if (options.branch) {
    return Ok(options.branch);
  }

  // If tag is specified, use it
  if (options.tag) {
    return Ok(options.tag);
  }

  // If createTag is specified, create and return it
  if (options.createTag) {
    const createResult = await createTag(
      options.createTag,
      undefined,
      path,
      logger,
    );
    if (!createResult.ok) {
      return Err(createResult.error);
    }
    return Ok(options.createTag);
  }

  // Interactive mode: ask user
  const typeResult = await promptPublishType();
  if (!typeResult.ok) {
    return Err(typeResult.error);
  }

  const type = typeResult.value;

  if (type === "branch") {
    const branchesResult = await getBranches(path);
    if (!branchesResult.ok) {
      return Err(branchesResult.error);
    }

    const statusResult = await getGitStatus(path);
    const currentBranch = statusResult.ok
      ? statusResult.value.currentBranch
      : null;

    const branchResult = await promptSelectBranch(
      branchesResult.value,
      currentBranch,
    );
    if (!branchResult.ok) {
      return Err(branchResult.error);
    }

    return Ok(branchResult.value);
  } else if (type === "tag") {
    const tagsResult = await getTags(path);
    if (!tagsResult.ok) {
      return Err(tagsResult.error);
    }

    const tagResult = await promptSelectTag(tagsResult.value);
    if (!tagResult.ok) {
      return Err(tagResult.error);
    }

    return Ok(tagResult.value);
  } else {
    // create-tag
    const newTagResult = await promptCreateTag();
    if (!newTagResult.ok) {
      return Err(newTagResult.error);
    }

    const { name, message } = newTagResult.value;
    const createResult = await createTag(name, message, path, logger);
    if (!createResult.ok) {
      return Err(createResult.error);
    }

    return Ok(name);
  }
}
