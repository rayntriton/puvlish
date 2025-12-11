/**
 * Test git status parsing
 */

// Simulate git status --porcelain output
const gitStatusOutputs = [
  " M deno.json",
  "M  deno.json",
  "MM deno.json",
  " M package.json",
  "?? new-file.txt",
];

function parseGitStatus(output: string): string[] {
  const files: string[] = [];
  const lines = output.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    const status = line.substring(0, 2);
    const file = line.substring(3).trim();
    files.push(file);
    console.log(`Line: "${line}"`);
    console.log(`  Status (0-2): "${status}"`);
    console.log(`  File (3+): "${file}"`);
    console.log(`  First char: '${file[0]}'`);
    console.log();
  }

  return files;
}

console.log("Testing git status parsing:\n");
console.log("=".repeat(60));

const output = gitStatusOutputs.join("\n");
const files = parseGitStatus(output);

console.log("\n" + "=".repeat(60));
console.log("\nExtracted files:");
files.forEach((file, i) => {
  console.log(`${i + 1}. "${file}"`);
});

// Test message generation
console.log("\n" + "=".repeat(60));
console.log("\nGenerated messages:");
files.forEach((file) => {
  const message = `Update ${file}`;
  console.log(`  "${message}"`);
  console.log(`    First char of filename: '${file[0]}'`);
  console.log(`    Message length: ${message.length}`);
});
