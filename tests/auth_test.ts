/**
 * Tests for auth module
 */

import { assertEquals } from "@std/assert";
import { AuthMethod, detectAuthMethod, getTokenFromEnv } from "../src/auth.ts";
import { RemotePlatform } from "../src/remote.ts";

Deno.test("detectAuthMethod - detects SSH", () => {
  assertEquals(
    detectAuthMethod("git@github.com:user/repo.git"),
    AuthMethod.SSH,
  );
  assertEquals(
    detectAuthMethod("git@gitlab.com:org/project.git"),
    AuthMethod.SSH,
  );
});

Deno.test("detectAuthMethod - detects HTTPS", () => {
  assertEquals(
    detectAuthMethod("https://github.com/user/repo.git"),
    AuthMethod.HTTPS,
  );
  assertEquals(
    detectAuthMethod("http://example.com/repo.git"),
    AuthMethod.HTTPS,
  );
});

Deno.test("detectAuthMethod - returns UNKNOWN for other formats", () => {
  assertEquals(
    detectAuthMethod("file:///local/repo"),
    AuthMethod.UNKNOWN,
  );
  assertEquals(
    detectAuthMethod("invalid-url"),
    AuthMethod.UNKNOWN,
  );
});

Deno.test("getTokenFromEnv - gets GitHub token from GITHUB_TOKEN", () => {
  Deno.env.set("GITHUB_TOKEN", "test_token");
  const token = getTokenFromEnv(RemotePlatform.GITHUB);
  assertEquals(token, "test_token");
  Deno.env.delete("GITHUB_TOKEN");
});

Deno.test("getTokenFromEnv - gets GitHub token from GH_TOKEN", () => {
  Deno.env.set("GH_TOKEN", "test_gh_token");
  const token = getTokenFromEnv(RemotePlatform.GITHUB);
  assertEquals(token, "test_gh_token");
  Deno.env.delete("GH_TOKEN");
});

Deno.test("getTokenFromEnv - prefers GITHUB_TOKEN over GH_TOKEN", () => {
  Deno.env.set("GITHUB_TOKEN", "primary_token");
  Deno.env.set("GH_TOKEN", "secondary_token");
  const token = getTokenFromEnv(RemotePlatform.GITHUB);
  assertEquals(token, "primary_token");
  Deno.env.delete("GITHUB_TOKEN");
  Deno.env.delete("GH_TOKEN");
});

Deno.test("getTokenFromEnv - gets GitLab token from GITLAB_TOKEN", () => {
  Deno.env.set("GITLAB_TOKEN", "test_gl_token");
  const token = getTokenFromEnv(RemotePlatform.GITLAB);
  assertEquals(token, "test_gl_token");
  Deno.env.delete("GITLAB_TOKEN");
});

Deno.test("getTokenFromEnv - returns undefined when no token set", () => {
  const token = getTokenFromEnv(RemotePlatform.GITHUB);
  assertEquals(token, undefined);
});

Deno.test("getTokenFromEnv - gets GIT_TOKEN for OTHER platforms", () => {
  Deno.env.set("GIT_TOKEN", "generic_token");
  const token = getTokenFromEnv(RemotePlatform.OTHER);
  assertEquals(token, "generic_token");
  Deno.env.delete("GIT_TOKEN");
});
