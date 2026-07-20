import assert from "node:assert/strict";
import test from "node:test";

import {
  projectMutationForbidden,
  resolveRequestIdentity,
  resolveProjectScope,
} from "../../lib/continuity/auth/project-scope.ts";

test("mutable hosted workspaces are namespaced by authenticated user without exposing email", async () => {
  const trust = { trustedIngressOrigins: "https://example.test" };
  const alice = await resolveProjectScope(new Request("https://example.test/api", {
    headers: { "oai-authenticated-user-email": "Alice@Example.com" },
  }), "continuity-workspace", trust);
  const aliceAgain = await resolveProjectScope(new Request("https://example.test/api", {
    headers: { "oai-authenticated-user-email": "alice@example.com" },
  }), "continuity-workspace", trust);
  const bob = await resolveProjectScope(new Request("https://example.test/api", {
    headers: { "oai-authenticated-user-email": "bob@example.com" },
  }), "continuity-workspace", trust);

  assert.equal(alice.projectId, aliceAgain.projectId);
  assert.notEqual(alice.projectId, bob.projectId);
  assert.doesNotMatch(alice.projectId, /alice|example\.com/i);
  assert.match(alice.projectId, /^continuity-workspace:user-[a-f0-9]{24}$/);
});

test("a hosted identity header is ignored unless its exact ingress origin is server-trusted", async () => {
  const forged = new Request("https://self-hosted.example/api", {
    headers: { "oai-authenticated-user-email": "victim@example.com" },
  });
  assert.equal(await resolveProjectScope(forged, "continuity-workspace"), null);
  assert.equal(
    await resolveProjectScope(forged, "continuity-workspace", {
      trustedIngressOrigins: "https://different.example",
    }),
    null,
  );
  assert.equal(resolveRequestIdentity(forged).kind, "untrusted");

  const trusted = resolveRequestIdentity(forged, {
    trustedIngressOrigins: "https://self-hosted.example",
  });
  assert.equal(trusted.kind, "trusted-ingress");
  assert.equal(trusted.email, "victim@example.com");
});

test("malformed, wildcard, non-TLS, and path-bearing ingress settings fail closed", async () => {
  const request = new Request("https://example.test/api", {
    headers: { "oai-authenticated-user-email": "owner@example.com" },
  });
  for (const trustedIngressOrigins of [
    "*.example.test",
    "http://example.test",
    "https://example.test/path",
    "https://example.test,not a URL",
  ]) {
    assert.equal(
      await resolveProjectScope(request, "continuity-workspace", { trustedIngressOrigins }),
      null,
    );
  }
});

test("unauthenticated hosted mutation has no project scope", async () => {
  const scope = await resolveProjectScope(
    new Request("https://example.test/api"),
    "continuity-workspace",
  );
  assert.equal(scope, null);
});

test("the reviewed sample is shared while localhost gets an isolated development scope", async () => {
  const sample = await resolveProjectScope(new Request("https://example.test/api"), "vcs-demo");
  const local = await resolveProjectScope(new Request("http://localhost/api"), "continuity-workspace");

  assert.equal(sample.projectId, "vcs-demo");
  assert.equal(sample.ownerScope, "shared-sample");
  assert.equal(local.projectId, "continuity-workspace:local");
});

test("the reviewed shared sample cannot be mutated", async () => {
  const sample = await resolveProjectScope(new Request("https://example.test/api"), "vcs-demo");
  const authenticated = await resolveProjectScope(new Request("https://example.test/api", {
    headers: { "oai-authenticated-user-email": "alice@example.test" },
  }), "continuity-workspace", { trustedIngressOrigins: "https://example.test" });

  assert.ok(sample);
  assert.ok(authenticated);
  const response = projectMutationForbidden(sample);
  assert.equal(response?.status, 403);
  assert.equal((await response?.json()).code, "shared_sample_read_only");
  assert.equal(projectMutationForbidden(authenticated), null);
});
