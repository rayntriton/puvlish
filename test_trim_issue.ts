/**
 * Test if trim() could be causing issues
 */

// Simulate git status output
const testLines = [
  " M deno.json",
  " M  deno.json",  // Extra space
  " M\tdeno.json",   // Tab
  " Mdeno.json",     // No space after status
];

testLines.forEach((line, i) => {
  console.log(`\nTest ${i + 1}: "${line}"`);
  console.log(`  Length: ${line.length}`);
  console.log(`  Chars: [${[...line].map((c, idx) => `${idx}:'${c}'`).join(", ")}]`);

  const status = line.substring(0, 2);
  const file1 = line.substring(3);  // Without trim
  const file2 = line.substring(3).trim();  // With trim

  console.log(`  Status: "${status}"`);
  console.log(`  File (no trim): "${file1}"`);
  console.log(`  File (with trim): "${file2}"`);

  if (file1 !== file2) {
    console.log(`  ⚠️  TRIMMING CHANGED THE STRING!`);
  }
});

// What if the issue is the substring index?
console.log("\n" + "=".repeat(60));
console.log("Testing different substring indices:");
const testLine = " M deno.json";
for (let i = 0; i <= 5; i++) {
  const result = testLine.substring(i).trim();
  console.log(`  substring(${i}): "${result}"`);
}
