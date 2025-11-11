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
 * Execute a command and return its output
 */
export async function executeCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<Result<string>> {
  try {
    // Inherit current environment and merge with provided env
    const currentEnv = Deno.env.toObject();
    const env = options?.env
      ? { ...currentEnv, ...options.env }
      : undefined;

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
      return Err(
        new Error(`Command failed with code ${code}: ${errorOutput || output}`),
      );
    }

    return Ok(output);
  } catch (error) {
    return Err(error as Error);
  }
}

/**
 * Check if a command is available in the system
 */
export async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    const result = await executeCommand(command, ["--version"]);
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
