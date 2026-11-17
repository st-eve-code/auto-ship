const test = require("node:test");
const assert = require("node:assert/strict");
const { findSecretFiles, parseStatus, makeTitle, makeBody, makeReview, parseRepoSpec } = require("../out/pure.js");

test("parses owner/name repository specs", () => {
  assert.deepEqual(parseRepoSpec("st-eve-code/new-project"), { owner: "st-eve-code", repo: "new-project" });
  assert.deepEqual(parseRepoSpec("owner/name.git"), { owner: "owner", repo: "name" });
  assert.equal(parseRepoSpec("just-a-name"), null);
  assert.equal(parseRepoSpec("https://github.com/owner/name"), null);
});
const { parseRemote } = require("../out/git.js");

test("flags .env and key files but allows .env.example", () => {
  const found = findSecretFiles([".env", ".env.local", ".env.example", "certs/server.pem", "src/app.ts", "id_rsa"]);
  assert.deepEqual(found, [".env", ".env.local", "certs/server.pem", "id_rsa"]);
});

test("parses porcelain status including renames", () => {
  const changes = parseStatus(" M lib/mail.ts\n?? app/new.ts\nR  old.ts -> new.ts\n");
  assert.deepEqual(changes, [
    { status: "M", path: "lib/mail.ts" },
    { status: "??", path: "app/new.ts" },
    { status: "R", path: "new.ts" },
  ]);
});

test("title uses the verb for what happened to the files", () => {
  assert.equal(makeTitle([{ status: "??", path: "a/x.ts" }, { status: "A", path: "b/y.ts" }]), "Add x.ts and y.ts");
  assert.equal(makeTitle([{ status: "D", path: "old.ts" }]), "Remove old.ts");
  assert.equal(makeTitle([{ status: "M", path: "lib/mail.ts" }, { status: "M", path: "lib/site.ts" }, { status: "M", path: "app/x.ts" }]), "Update mail.ts and site.ts and 1 more");
});

test("title is capped at 72 characters", () => {
  const long = makeTitle([{ status: "M", path: "a".repeat(80) + ".ts" }]);
  assert.ok(long.length <= 72);
});

test("body lists each changed file", () => {
  const body = makeBody([{ status: "M", path: "lib/mail.ts" }]);
  assert.match(body, /`lib\/mail\.ts` \(modified\)/);
});

test("review marks failed checks and includes their output", () => {
  const review = makeReview(
    [
      { name: "lint", ok: true, output: "" },
      { name: "typecheck", ok: false, output: "error TS2503" },
    ],
    "feature/x"
  );
  assert.match(review, /1 check\(s\) failed/);
  assert.match(review, /typecheck output/);
  assert.match(review, /error TS2503/);
});

test("review with all checks passing says so", () => {
  const review = makeReview([{ name: "lint", ok: true, output: "" }], "main");
  assert.match(review, /All checks passed/);
});

test("parses https and ssh GitHub remotes", () => {
  assert.deepEqual(parseRemote("https://github.com/st-eve-code/Cargo.git"), { owner: "st-eve-code", repo: "Cargo" });
  assert.deepEqual(parseRemote("git@github.com:st-eve-code/Cargo.git"), { owner: "st-eve-code", repo: "Cargo" });
  assert.equal(parseRemote("https://gitlab.com/a/b.git"), null);
});
