/**
 * Tests for remote module
 */

import { assertEquals } from "@std/assert";
import {
  detectPlatform,
  getRemoteInfo,
  parseGitUrl,
  RemotePlatform,
  validateRemoteUrl,
} from "../src/remote.ts";

Deno.test("detectPlatform - detects GitHub", () => {
  assertEquals(
    detectPlatform("https://github.com/user/repo.git"),
    RemotePlatform.GITHUB,
  );
  assertEquals(
    detectPlatform("git@github.com:user/repo.git"),
    RemotePlatform.GITHUB,
  );
});

Deno.test("detectPlatform - detects GitLab", () => {
  assertEquals(
    detectPlatform("https://gitlab.com/user/repo.git"),
    RemotePlatform.GITLAB,
  );
  assertEquals(
    detectPlatform("git@gitlab.com:user/repo.git"),
    RemotePlatform.GITLAB,
  );
});

Deno.test("detectPlatform - detects Bitbucket", () => {
  assertEquals(
    detectPlatform("https://bitbucket.org/user/repo.git"),
    RemotePlatform.BITBUCKET,
  );
});

Deno.test("detectPlatform - returns OTHER for unknown platforms", () => {
  assertEquals(
    detectPlatform("https://git.example.com/user/repo.git"),
    RemotePlatform.OTHER,
  );
});

Deno.test("parseGitUrl - parses HTTPS GitHub URL", () => {
  const result = parseGitUrl("https://github.com/octocat/Hello-World.git");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.owner, "octocat");
    assertEquals(result.value.repo, "Hello-World");
  }
});

Deno.test("parseGitUrl - parses HTTPS URL without .git", () => {
  const result = parseGitUrl("https://github.com/user/repo");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.owner, "user");
    assertEquals(result.value.repo, "repo");
  }
});

Deno.test("parseGitUrl - parses SSH GitHub URL", () => {
  const result = parseGitUrl("git@github.com:user/repo.git");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.owner, "user");
    assertEquals(result.value.repo, "repo");
  }
});

Deno.test("parseGitUrl - parses SSH URL without .git", () => {
  const result = parseGitUrl("git@gitlab.com:organization/project");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.value.owner, "organization");
    assertEquals(result.value.repo, "project");
  }
});

Deno.test("parseGitUrl - fails for invalid URL", () => {
  const result = parseGitUrl("not-a-valid-url");
  assertEquals(result.ok, false);
});

Deno.test("getRemoteInfo - extracts info from GitHub remote", () => {
  const remote = {
    name: "origin",
    url: "https://github.com/user/repo.git",
  };

  const info = getRemoteInfo(remote);
  assertEquals(info.name, "origin");
  assertEquals(info.url, remote.url);
  assertEquals(info.platform, RemotePlatform.GITHUB);
  assertEquals(info.owner, "user");
  assertEquals(info.repo, "repo");
});

Deno.test("getRemoteInfo - handles unparseable URLs", () => {
  const remote = {
    name: "origin",
    url: "invalid-url",
  };

  const info = getRemoteInfo(remote);
  assertEquals(info.name, "origin");
  assertEquals(info.url, remote.url);
  assertEquals(info.platform, RemotePlatform.OTHER);
  assertEquals(info.owner, undefined);
  assertEquals(info.repo, undefined);
});

Deno.test("validateRemoteUrl - accepts HTTPS URL", () => {
  const result = validateRemoteUrl("https://github.com/user/repo.git");
  assertEquals(result.ok, true);
});

Deno.test("validateRemoteUrl - accepts HTTP URL", () => {
  const result = validateRemoteUrl("http://example.com/repo.git");
  assertEquals(result.ok, true);
});

Deno.test("validateRemoteUrl - accepts SSH URL", () => {
  const result = validateRemoteUrl("git@github.com:user/repo.git");
  assertEquals(result.ok, true);
});

Deno.test("validateRemoteUrl - rejects invalid protocol", () => {
  const result = validateRemoteUrl("ftp://example.com/repo.git");
  assertEquals(result.ok, false);
});

Deno.test("validateRemoteUrl - rejects plain string", () => {
  const result = validateRemoteUrl("just-a-string");
  assertEquals(result.ok, false);
});
