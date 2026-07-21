import assert from "node:assert/strict";
import test from "node:test";

import {
  discoverRepositoryProjectScopes,
  parseDeclaredRepositoryProjectScopes,
  repositoryEntryBelongsToScope,
  resolveRepositoryProjectScope,
} from "../../lib/continuity/repositories/project-boundary.ts";

function entry(path) {
  return { path, type: "blob", mode: "100644", sha: "a".repeat(40), size: 12 };
}

test("a generic question fails closed when one repository tree contains independent project roots", () => {
  const entries = [
    entry("README.md"),
    entry("AGENTS.md"),
    entry("canon/STORY_BIBLE.md"),
    entry("canon-consequence-lab/README.md"),
    entry("canon-consequence-lab/package.json"),
    entry("canon-consequence-lab/lib/continuity/engine.ts"),
  ];
  const scopes = discoverRepositoryProjectScopes(entries, [], "Slap the Heavens");
  const result = resolveRepositoryProjectScope(entries, scopes, "What is considered canon in this folder?");

  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.candidates.map((scope) => scope.rootPath), [".", "canon-consequence-lab"]);
  assert.equal(result.selected, null);
});

test("a named nested project resolves without leaking files from its parent project", () => {
  const entries = [
    entry("README.md"),
    entry("canon/STORY_BIBLE.md"),
    entry("canon-consequence-lab/README.md"),
    entry("canon-consequence-lab/package.json"),
    entry("canon-consequence-lab/lib/continuity/engine.ts"),
  ];
  const scopes = discoverRepositoryProjectScopes(entries, [], "Slap the Heavens");
  const result = resolveRepositoryProjectScope(entries, scopes, "What does Continuity Lab consider product truth?");

  assert.equal(result.status, "resolved");
  assert.equal(result.selected.rootPath, "canon-consequence-lab");
  assert.equal(repositoryEntryBelongsToScope(entries[1], result.selected), false);
  assert.equal(repositoryEntryBelongsToScope(entries[4], result.selected), true);
});

test("repository-declared product and example domains remain separate without granting authority", () => {
  const declared = parseDeclaredRepositoryProjectScopes(JSON.stringify({
    projectScopes: [
      {
        id: "continuity-lab",
        label: "Continuity Lab product",
        root: ".",
        kind: "product",
        exclude: ["lib/continuity/demo.ts"],
      },
      {
        id: "vcs-demo",
        label: "Vibe Code Simulator reviewed example",
        root: ".",
        kind: "example",
        include: ["lib/continuity/demo.ts"],
      },
    ],
  }));
  const entries = [entry("README.md"), entry("package.json"), entry("lib/continuity/demo.ts")];
  const scopes = discoverRepositoryProjectScopes(entries, declared, "Continuity Lab");

  assert.equal(scopes.length, 2);
  assert.ok(scopes.every((scope) => scope.origin === "repository_declared"));
  assert.equal(resolveRepositoryProjectScope(entries, scopes, "What is canon in this project?").status, "ambiguous");
  assert.equal(resolveRepositoryProjectScope(entries, scopes, "What is canon in Vibe Code Simulator?").selected.id, "vcs-demo");
  assert.equal(resolveRepositoryProjectScope(entries, scopes, "How does Continuity Lab route evidence?").selected.id, "continuity-lab");
  assert.equal(repositoryEntryBelongsToScope(entries[2], scopes.find((scope) => scope.id === "continuity-lab")), false);
  assert.equal(repositoryEntryBelongsToScope(entries[2], scopes.find((scope) => scope.id === "vcs-demo")), true);
});

test("same-root evidence domains require their scope ID rather than an ambiguous path", () => {
  const declared = parseDeclaredRepositoryProjectScopes(JSON.stringify({
    projectScopes: [
      { id: "product", label: "Product", root: ".", kind: "product" },
      { id: "example", label: "Example", root: ".", kind: "example" },
    ],
  }));
  const entries = [entry("README.md")];
  const scopes = discoverRepositoryProjectScopes(entries, declared, "Repository");

  assert.equal(resolveRepositoryProjectScope(entries, scopes, "What is true?", ".").status, "ambiguous");
  assert.equal(resolveRepositoryProjectScope(entries, scopes, "What is true?", "example").selected.id, "example");
});

test("malformed declarations cannot forge roots, IDs, or path traversal", () => {
  const scopes = parseDeclaredRepositoryProjectScopes(JSON.stringify({
    projectScopes: [
      { id: "safe", label: "Safe", root: "game" },
      { id: "unsafe", label: "Unsafe", root: "../secret" },
      { id: "bad id", label: "Bad", root: "." },
      { id: "patterns", label: "Patterns", root: ".", include: ["src/**", "../secret/**"] },
    ],
  }));

  assert.deepEqual(scopes.map((scope) => scope.id), ["safe", "patterns"]);
  assert.deepEqual(scopes.find((scope) => scope.id === "patterns").include, ["src/**"]);
  assert.ok(scopes.every((scope) => scope.origin === "repository_declared"));
});
