/**
 * Tests for registry module
 */

import { assertEquals } from "@std/assert";
import { getRegistryName, RegistryType } from "../src/registry.ts";

Deno.test("getRegistryName - returns npm for NPM registry", () => {
  assertEquals(getRegistryName(RegistryType.NPM), "npm");
});

Deno.test("getRegistryName - returns JSR for JSR registry", () => {
  assertEquals(getRegistryName(RegistryType.JSR), "JSR");
});

// Note: Tests for detectNpmPackage and detectJsrPackage would require
// creating temporary files, which is more complex. These would be
// integration tests rather than unit tests.
