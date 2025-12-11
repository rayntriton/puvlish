/**
 * Test commit message generation to find the bug
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
    console.log(`Parsing line: "${line}" (length: ${line.length})`);
    console.log(`  Chars: [${[...line].map((c, i) => `${i}:'${c}'`).join(", ")}]`);

    const status = line.substring(0, 2);
    const file = line.substring(3).trim();

    console.log(`  Status: "${status}"`);
    console.log(`  File: "${file}"`);
    console.log();

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

function generateCommitMessage(changes: GitChanges): string {
  const parts: string[] = [];

  if (changes.added.length > 0) {
    if (changes.added.length === 1) {
      parts.push(`Add ${changes.added[0]}`);
    } else {
      parts.push(`Add ${changes.added.length} files`);
    }
  }

  if (changes.modified.length > 0) {
    if (changes.modified.length === 1 && parts.length === 0) {
      const message = `Update ${changes.modified[0]}`;
      console.log(`Generated message for single modified file:`);
      console.log(`  File: "${changes.modified[0]}"`);
      console.log(`  Message: "${message}"`);
      console.log(`  Message chars: [${[...message].map((c, i) => `${i}:'${c}'`).join(", ")}]`);
      parts.push(message);
    } else if (parts.length === 0) {
      parts.push(`Update ${changes.modified.length} files`);
    }
  }

  if (changes.deleted.length > 0 && parts.length === 0) {
    if (changes.deleted.length === 1) {
      parts.push(`Delete ${changes.deleted[0]}`);
    } else {
      parts.push(`Delete ${changes.deleted.length} files`);
    }
  }

  if (parts.length === 0) {
    return "Update files";
  }

  return parts.join(", ");
}

// Test cases
console.log("=" .repeat(80));
console.log("TEST 1: Single modified file (deno.json)");
console.log("=" .repeat(80));
const test1 = " M deno.json";
const changes1 = parseGitStatus(test1);
const message1 = generateCommitMessage(changes1);
console.log(`\nFinal message: "${message1}"\n`);

console.log("=" .repeat(80));
console.log("TEST 2: Modified file with different spacing");
console.log("=" .repeat(80));
const test2 = "M  deno.json";
const changes2 = parseGitStatus(test2);
const message2 = generateCommitMessage(changes2);
console.log(`\nFinal message: "${message2}"\n`);

console.log("=" .repeat(80));
console.log("TEST 3: What if there's a tab character?");
console.log("=" .repeat(80));
const test3 = " M\tdeno.json";
const changes3 = parseGitStatus(test3);
const message3 = generateCommitMessage(changes3);
console.log(`\nFinal message: "${message3}"\n`);
