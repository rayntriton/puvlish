/**
 * Interactive prompts module for publishjs
 */

import { Confirm, Input, Select } from "@cliffy/prompt";
import { Err, Logger, Ok, PublishError, Result } from "./utils.ts";

/**
 * Prompt user to initialize Git repository
 */
export async function promptInitGit(logger: Logger): Promise<boolean> {
  logger.warn("This directory is not a Git repository.");

  const answer = await Confirm.prompt({
    message: "Would you like to initialize a Git repository?",
    default: true,
  });

  return answer;
}

/**
 * Prompt user to select a branch
 */
export async function promptSelectBranch(
  branches: string[],
  currentBranch?: string | null,
): Promise<Result<string>> {
  if (branches.length === 0) {
    return Err(
      new PublishError("No branches available", "NO_BRANCHES"),
    );
  }

  try {
    const branch = await Select.prompt({
      message: "Select a branch to publish:",
      options: branches,
      default: currentBranch || branches[0],
    });

    return Ok(branch);
  } catch (error) {
    return Err(
      new PublishError("Branch selection cancelled", "PROMPT_CANCELLED", error),
    );
  }
}

/**
 * Prompt user to select a tag
 */
export async function promptSelectTag(tags: string[]): Promise<Result<string>> {
  if (tags.length === 0) {
    return Err(
      new PublishError("No tags available", "NO_TAGS"),
    );
  }

  try {
    const tag = await Select.prompt({
      message: "Select a tag to publish:",
      options: tags,
      default: tags[tags.length - 1], // Default to latest tag
    });

    return Ok(tag);
  } catch (error) {
    return Err(
      new PublishError("Tag selection cancelled", "PROMPT_CANCELLED", error),
    );
  }
}

/**
 * Prompt user to create a new tag
 */
export async function promptCreateTag(): Promise<Result<{
  name: string;
  message?: string;
}>> {
  try {
    const name = await Input.prompt({
      message: "Enter tag name (e.g., v1.0.0):",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Tag name cannot be empty";
        }
        return true;
      },
    });

    const addMessage = await Confirm.prompt({
      message: "Add a tag message?",
      default: false,
    });

    let message: string | undefined;
    if (addMessage) {
      message = await Input.prompt({
        message: "Enter tag message:",
      });
    }

    return Ok({ name: name.trim(), message });
  } catch (error) {
    return Err(
      new PublishError("Tag creation cancelled", "PROMPT_CANCELLED", error),
    );
  }
}

/**
 * Prompt user to select what to publish
 */
export async function promptPublishType(): Promise<
  Result<"branch" | "tag" | "create-tag">
> {
  try {
    const type = await Select.prompt({
      message: "What would you like to publish?",
      options: [
        { value: "branch", name: "Push an existing branch" },
        { value: "tag", name: "Push an existing tag" },
        { value: "create-tag", name: "Create and push a new tag" },
      ],
    });

    return Ok(type as "branch" | "tag" | "create-tag");
  } catch (error) {
    return Err(
      new PublishError("Selection cancelled", "PROMPT_CANCELLED", error),
    );
  }
}

/**
 * Prompt user to select registries to publish to
 */
export async function promptSelectRegistries(
  available: string[],
): Promise<Result<string[]>> {
  if (available.length === 0) {
    return Ok([]);
  }

  try {
    // If only one registry is available, ask if they want to publish to it
    if (available.length === 1) {
      const confirm = await Confirm.prompt({
        message: `Publish to ${available[0]}?`,
        default: true,
      });

      return Ok(confirm ? available : []);
    }

    // Multiple registries available
    const registries: string[] = [];

    for (const registry of available) {
      const confirm = await Confirm.prompt({
        message: `Publish to ${registry}?`,
        default: true,
      });

      if (confirm) {
        registries.push(registry);
      }
    }

    return Ok(registries);
  } catch (error) {
    return Err(
      new PublishError("Registry selection cancelled", "PROMPT_CANCELLED", error),
    );
  }
}

/**
 * Prompt for confirmation before proceeding with publish
 */
export async function promptConfirmPublish(
  ref: string,
  remote: string,
  registries: string[],
): Promise<boolean> {
  console.log("\n📦 Ready to publish:");
  console.log(`   Git: ${ref} → ${remote}`);

  if (registries.length > 0) {
    console.log(`   Registries: ${registries.join(", ")}`);
  }

  console.log();

  try {
    const confirmed = await Confirm.prompt({
      message: "Proceed with publish?",
      default: true,
    });

    return confirmed;
  } catch {
    return false;
  }
}

/**
 * Prompt user to input remote URL
 */
export async function promptRemoteUrl(): Promise<Result<string>> {
  try {
    const url = await Input.prompt({
      message: "Enter remote repository URL:",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "URL cannot be empty";
        }
        if (!/^(https?:\/\/|git@)/.test(value)) {
          return "URL must start with https://, http://, or git@";
        }
        return true;
      },
    });

    return Ok(url.trim());
  } catch (error) {
    return Err(
      new PublishError("URL input cancelled", "PROMPT_CANCELLED", error),
    );
  }
}

/**
 * Prompt user to wait after showing instructions
 */
export async function promptContinue(message: string = "Press Enter to continue..."): Promise<void> {
  try {
    await Input.prompt({
      message,
    });
  } catch {
    // User cancelled, that's okay
  }
}
