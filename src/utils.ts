/**
 * Utility functions for publishjs CLI tool
 */

import { bold, green, red, yellow, blue, cyan } from "@std/fmt/colors";

/**
 * Log levels for the CLI
 */
export enum LogLevel {
  INFO = "info",
  SUCCESS = "success",
  WARN = "warn",
  ERROR = "error",
  DEBUG = "debug",
}

/**
 * Logger class for consistent output formatting
 */
export class Logger {
  constructor(private verbose: boolean = false) {}

  info(message: string): void {
    console.log(`${blue("ℹ")} ${message}`);
  }

  success(message: string): void {
    console.log(`${green("✓")} ${message}`);
  }

  warn(message: string): void {
    console.warn(`${yellow("⚠")} ${message}`);
  }

  error(message: string): void {
    console.error(`${red("✗")} ${message}`);
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(`${cyan("🔍")} ${message}`);
    }
  }

  section(title: string): void {
    console.log(`\n${bold(title)}`);
  }
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Create a successful result
 */
export function Ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/**
 * Create a failed result
 */
export function Err<E = Error>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Sanitize sensitive data from strings (tokens, passwords)
 */
function sanitizeSensitiveData(text: string): string {
  // Hide GitHub tokens (flexible length)
  text = text.replace(/ghp_[a-zA-Z0-9_-]+/g, "ghp_***");
  text = text.replace(/gho_[a-zA-Z0-9_-]+/g, "gho_***");

  // Hide GitLab tokens (flexible length)
  text = text.replace(/glpat-[a-zA-Z0-9_-]+/g, "glpat-***");

  // Hide JSR tokens (flexible length - captures any alphanumeric after jsrp_)
  text = text.replace(/jsrp_[a-zA-Z0-9_-]+/g, "jsrp_***");

  // Hide npm tokens
  text = text.replace(/npm_[a-zA-Z0-9_-]+/g, "npm_***");

  // Hide tokens in URLs (anything between https:// and @)
  text = text.replace(/https:\/\/[^@\s]+@/g, "https://***@");

  // Hide generic tokens in environment variable format (TOKEN=value)
  text = text.replace(/(_TOKEN|_KEY|_SECRET)=([^\s]+)/g, "$1=***");

  // Hide any remaining token-like patterns (word_alphanumeric)
  // This catches tokens that follow common patterns but weren't caught above
  text = text.replace(/\b(token|key|secret|password|auth)_[a-zA-Z0-9_-]{20,}/gi, "$1_***");

  return text;
}

/**
 * Remove credentials from Git URL (for safe storage in package.json/deno.json)
 * IMPORTANT: This is for configuration files that will be committed to Git
 *
 * @param url - Git URL that may contain credentials
 * @returns Clean URL without credentials
 *
 * @example
 * sanitizeGitUrl("https://token@github.com/user/repo.git")
 * // Returns: "https://github.com/user/repo.git"
 *
 * sanitizeGitUrl("git@github.com:user/repo.git")
 * // Returns: "git@github.com:user/repo.git" (unchanged, SSH is safe)
 */
export function sanitizeGitUrl(url: string): string {
  // Remove any credentials from HTTPS URLs
  // https://token@github.com/user/repo.git -> https://github.com/user/repo.git
  url = url.replace(/https:\/\/[^@]+@/g, "https://");

  // Remove any credentials from HTTP URLs
  url = url.replace(/http:\/\/[^@]+@/g, "http://");

  // SSH URLs don't contain credentials, so they're safe as-is
  // git@github.com:user/repo.git remains unchanged

  return url.trim();
}

/**
 * Format command for logging
 */
function formatCommandForLog(command: string, args: string[]): string {
  const fullCommand = [command, ...args].join(" ");
  return sanitizeSensitiveData(fullCommand);
}

/**
 * Execute a command and return its output
 */
export async function executeCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> },
  logger?: Logger,
): Promise<Result<string>> {
  try {
    // Log command execution
    const commandStr = formatCommandForLog(command, args);
    if (logger) {
      logger.debug(`🔧 Running: ${commandStr}`);
      if (options?.cwd && options.cwd !== Deno.cwd()) {
        logger.debug(`   (in ${options.cwd})`);
      }
    }

    // Always inherit current environment and merge with provided env
    const currentEnv = Deno.env.toObject();
    const env = options?.env
      ? { ...currentEnv, ...options.env }
      : currentEnv;

    const cmd = new Deno.Command(command, {
      args,
      cwd: options?.cwd,
      env,
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await cmd.output();

    const output = new TextDecoder().decode(stdout).trim();
    const errorOutput = new TextDecoder().decode(stderr).trim();

    if (code !== 0) {
      // Log command failure
      if (logger) {
        logger.debug(`✗ Command failed (exit code ${code})`);
        if (errorOutput) {
          const sanitizedError = sanitizeSensitiveData(errorOutput);
          logger.debug(`   stderr: ${sanitizedError}`);
        }
      }

      return Err(
        new Error(`Command failed with code ${code}: ${errorOutput || output}`),
      );
    }

    // Log success in verbose mode
    if (logger) {
      logger.debug(`✓ Command succeeded`);
      if (output && output.length > 0) {
        const sanitizedOutput = sanitizeSensitiveData(output);
        // Only show first 200 chars to avoid cluttering logs
        const preview = sanitizedOutput.length > 200
          ? sanitizedOutput.substring(0, 200) + "..."
          : sanitizedOutput;
        logger.debug(`   output: ${preview}`);
      }
    }

    return Ok(output);
  } catch (error) {
    // Log unexpected errors
    if (logger) {
      logger.debug(`✗ Command threw exception: ${(error as Error).message}`);
    }
    return Err(error as Error);
  }
}

/**
 * Check if a command is available in the system
 */
export async function isCommandAvailable(
  command: string,
  logger?: Logger,
): Promise<boolean> {
  try {
    const result = await executeCommand(command, ["--version"], undefined, logger);
    return result.ok;
  } catch {
    return false;
  }
}

/**
 * Custom error class for publishjs
 */
export class PublishError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PublishError";
  }
}

/**
 * Validate that a string is not empty
 */
export function validateNotEmpty(value: string, fieldName: string): Result<string> {
  if (!value || value.trim().length === 0) {
    return Err(new PublishError(`${fieldName} cannot be empty`, "VALIDATION_ERROR"));
  }
  return Ok(value.trim());
}

/**
 * Validate a URL
 */
export function validateUrl(url: string): Result<URL> {
  try {
    const parsed = new URL(url);
    return Ok(parsed);
  } catch {
    return Err(new PublishError(`Invalid URL: ${url}`, "INVALID_URL"));
  }
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a list of items as a bulleted list
 */
export function formatList(items: string[]): string {
  return items.map((item) => `  • ${item}`).join("\n");
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
}
