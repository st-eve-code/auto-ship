/* Copies compiled files into the npm package folder before packing. Run from the npm folder by prepack. */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const target = path.resolve(root, "npm", "out");

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });

for (const file of ["cli.js", "core.js", "fix.js", "git.js", "github.js", "pure.js"]) {
  const from = path.join(root, "out", file);
  if (!fs.existsSync(from)) throw new Error(`Missing compiled file: ${from}. Run npm run compile first.`);
  fs.copyFileSync(from, path.join(target, file));
}

for (const file of ["README.md", "LICENSE"]) {
  fs.copyFileSync(path.join(root, file), path.resolve(root, "npm", file));
}

console.log("Prepared npm package files.");
