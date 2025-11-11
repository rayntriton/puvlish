/**
 * Tests for utils module
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  Err,
  formatList,
  Logger,
  LogLevel,
  Ok,
  PublishError,
  truncate,
  validateNotEmpty,
  validateUrl,
} from "../src/utils.ts";

Deno.test("Logger - creates logger instance", () => {
  const logger = new Logger();
  assertExists(logger);
});

Deno.test("Logger - creates verbose logger", () => {
  const logger = new Logger(true);
  assertExists(logger);
});

Deno.test("Ok - creates successful result", () => {
  const result = Ok("test");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value, "test");
  }
});

Deno.test("Err - creates error result", () => {
  const error = new Error("test error");
  const result = Err(error);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, error);
  }
});

Deno.test("PublishError - creates custom error", () => {
  const error = new PublishError("test message", "TEST_CODE");
  assertEquals(error.message, "test message");
  assertEquals(error.code, "TEST_CODE");
  assertEquals(error.name, "PublishError");
});

Deno.test("validateNotEmpty - accepts valid string", () => {
  const result = validateNotEmpty("test", "field");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value, "test");
  }
});

Deno.test("validateNotEmpty - trims whitespace", () => {
  const result = validateNotEmpty("  test  ", "field");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value, "test");
  }
});

Deno.test("validateNotEmpty - rejects empty string", () => {
  const result = validateNotEmpty("", "field");
  assertEquals(result.ok, false);
});

Deno.test("validateNotEmpty - rejects whitespace only", () => {
  const result = validateNotEmpty("   ", "field");
  assertEquals(result.ok, false);
});

Deno.test("validateUrl - accepts valid HTTPS URL", () => {
  const result = validateUrl("https://github.com/user/repo");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.href, "https://github.com/user/repo");
  }
});

Deno.test("validateUrl - accepts valid HTTP URL", () => {
  const result = validateUrl("http://example.com");
  assertEquals(result.ok, true);
});

Deno.test("validateUrl - rejects invalid URL", () => {
  const result = validateUrl("not a url");
  assertEquals(result.ok, false);
});

Deno.test("formatList - formats array as bulleted list", () => {
  const items = ["item1", "item2", "item3"];
  const result = formatList(items);
  assertEquals(result, "  • item1\n  • item2\n  • item3");
});

Deno.test("formatList - handles empty array", () => {
  const result = formatList([]);
  assertEquals(result, "");
});

Deno.test("truncate - does not truncate short strings", () => {
  const result = truncate("short", 10);
  assertEquals(result, "short");
});

Deno.test("truncate - truncates long strings", () => {
  const result = truncate("this is a very long string", 10);
  assertEquals(result, "this is...");
});

Deno.test("truncate - handles exact length", () => {
  const result = truncate("exactly10!", 10);
  assertEquals(result, "exactly10!");
});
