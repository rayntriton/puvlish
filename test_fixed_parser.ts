/**
 * Test the fixed parser
 */

interface GitChanges {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
  total: number;
}

function parseGitStatus(output: string): GitChanges {
  const changes: GitChanges = {
    modified: [],
    added: [],
    deleted: [],
    untracked: [],
    total: 0,
  };

  const lines = output.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    // Git status --porcelain format: XY filename
    // where X and Y are status codes, followed by a space, then the filename
    // We need to be more robust in parsing
    const status = line.substring(0, 2);

    // Find the first non-space character after position 2 to handle variable spacing
    let fileStartIndex = 2;
    while (fileStartIndex < line.length && line[fileStartIndex] === ' ') {
      fileStartIndex++;
    }

    const file = line.substring(fileStartIndex).trim();

    if (!file) continue; // Skip if no filename found

    if (status.includes("M")) {
      changes.modified.push(file);
    } else if (status.includes("A")) {
      changes.added.push(file);
    } else if (status.includes("D")) {
      changes.deleted.push(file);
    } else if (status.includes("?")) {
      changes.untracked.push(file);
    }
  }

  changes.total = changes.modified.length +
    changes.added.length +
    changes.deleted.length +
    changes.untracked.length;

  return changes;
}

// Test cases including the problematic ones
const testCases = [
  {
    name: "Standard format with single space",
    input: " M deno.json",
    expected: ["deno.json"],
  },
  {
    name: "Format with double space",
    input: "M  deno.json",
    expected: ["deno.json"],
  },
  {
    name: "Format with triple space",
    input: "M   deno.json",
    expected: ["deno.json"],
  },
  {
    name: "No space after status (edge case)",
    input: " Mdeno.json",
    expected: ["deno.json"],
  },
  {
    name: "Multiple files",
    input: " M deno.json\n M package.json\n?? new-file.txt",
    expectedModified: ["deno.json", "package.json"],
    expectedUntracked: ["new-file.txt"],
  },
];

console.log("Testing fixed parser:\n");
console.log("=".repeat(60));

let passed = 0;
let failed = 0;

testCases.forEach((testCase) => {
  console.log(`\nTest: ${testCase.name}`);
  console.log(`Input: "${testCase.input.replace(/\n/g, "\\n")}"`);

  const changes = parseGitStatus(testCase.input);

  if (testCase.expected) {
    const success = changes.modified.length === testCase.expected.length &&
      changes.modified[0] === testCase.expected[0];

    if (success) {
      console.log(`✅ PASS - Got: "${changes.modified[0]}"`);
      passed++;
    } else {
      console.log(`❌ FAIL - Expected: "${testCase.expected[0]}", Got: "${changes.modified[0]}"`);
      failed++;
    }
  } else if (testCase.expectedModified && testCase.expectedUntracked) {
    const modifiedOk = JSON.stringify(changes.modified) === JSON.stringify(testCase.expectedModified);
    const untrackedOk = JSON.stringify(changes.untracked) === JSON.stringify(testCase.expectedUntracked);

    if (modifiedOk && untrackedOk) {
      console.log(`✅ PASS`);
      console.log(`  Modified: ${JSON.stringify(changes.modified)}`);
      console.log(`  Untracked: ${JSON.stringify(changes.untracked)}`);
      passed++;
    } else {
      console.log(`❌ FAIL`);
      console.log(`  Expected Modified: ${JSON.stringify(testCase.expectedModified)}`);
      console.log(`  Got Modified: ${JSON.stringify(changes.modified)}`);
      console.log(`  Expected Untracked: ${JSON.stringify(testCase.expectedUntracked)}`);
      console.log(`  Got Untracked: ${JSON.stringify(changes.untracked)}`);
      failed++;
    }
  }
});

console.log("\n" + "=".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log("\n🎉 All tests passed! The parser now handles all edge cases correctly.");
} else {
  console.log("\n❌ Some tests failed.");
  Deno.exit(1);
}
