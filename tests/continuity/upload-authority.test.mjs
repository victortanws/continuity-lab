import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDirectUpload,
  inferSafeDirectUploadType,
} from "../../lib/continuity/repositories/authority.ts";
import {
  POST as uploadSource,
  SourceUploadMetadataError,
  sourceUploadQuotaBytes,
  validateSourceUploadMetadata,
} from "../../app/api/continuity/sources/route.ts";
import { POST as connectRepository } from "../../app/api/continuity/repositories/route.ts";

function uploadRequest(fields = {}) {
  const form = new FormData();
  form.set("projectId", "upload-policy-test");
  form.set("file", new File(["Once upon a time"], "pg1342.txt", { type: "text/plain" }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new Request("http://localhost/api/continuity/sources", { method: "POST", body: form });
}

test("an opaque manuscript can be explicitly routed as narrative evidence", () => {
  const profile = classifyDirectUpload("narrative");

  assert.deepEqual(profile, {
    documentType: "narrative",
    authority: "reference",
    closedWorld: false,
    role: "intent",
    lifecycle: "active",
    claimKinds: ["identity", "normative", "causal"],
  });

  // Classification comes from the bounded selector, not a meaningful filename.
  assert.equal(inferSafeDirectUploadType("pg1342.txt"), "reference");
  assert.equal(classifyDirectUpload("narrative")?.role, "intent");
});

test("direct upload types stay inside the non-operational authority envelope", () => {
  const expected = {
    narrative: ["reference", "intent", "active"],
    reference: ["reference", "reference", "active"],
    proposal: ["proposal", "proposal", "proposed"],
  };

  for (const [documentType, [authority, role, lifecycle]] of Object.entries(expected)) {
    const profile = classifyDirectUpload(documentType);
    assert.ok(profile);
    assert.equal(profile.authority, authority);
    assert.equal(profile.role, role);
    assert.equal(profile.lifecycle, lifecycle);
    assert.equal(profile.closedWorld, false);
    assert.notEqual(profile.authority, "immutable");
    assert.notEqual(profile.role, "implementation");
    assert.notEqual(profile.role, "observation");
  }
});

test("untrusted upload values cannot select arbitrary roles or inherited properties", () => {
  for (const value of [
    "canon",
    "immutable",
    "implementation",
    "observation",
    "closed_world",
    "toString",
    "__proto__",
    "Narrative",
    "",
    null,
    { documentType: "narrative" },
  ]) {
    assert.equal(classifyDirectUpload(value), null, `expected rejection for ${String(value)}`);
  }
});

test("the upload API rejects arbitrary types and caller-selected authority before storage", async () => {
  const invalidType = await uploadSource(uploadRequest({ documentType: "implementation" }));
  assert.equal(invalidType.status, 400);
  assert.match((await invalidType.json()).error, /narrative, reference, or proposal/i);

  const forgedAuthority = await uploadSource(uploadRequest({
    documentType: "narrative",
    authority: "canon",
  }));
  assert.equal(forgedAuthority.status, 400);
  assert.match((await forgedAuthority.json()).error, /cannot choose stronger authority/i);
});

test("multipart metadata is bounded, single-valued, and charged to byte quotas", () => {
  const file = new File(["hello"], "story.md", { type: "text/markdown" });
  const form = new FormData();
  form.set("projectId", "project-one");
  form.set("projectTitle", "A bounded project");
  form.set("logicalName", "Chapter one");
  form.set("documentType", "narrative");
  form.set("authority", "reference");
  form.set("validFrom", "Day 8");
  form.set("supersedesSourceId", "source-version_prior");
  form.set("file", file);

  const metadata = validateSourceUploadMetadata(form, file);
  assert.equal(metadata.originalFilename, "story.md");
  assert.equal(metadata.validFromOrder, 8);
  assert.equal(metadata.temporalAxis, "day");
  assert.ok(metadata.encodedBytes > 0);
  assert.equal(sourceUploadQuotaBytes(file.size, metadata.encodedBytes), file.size + metadata.encodedBytes);

  const duplicate = new FormData();
  for (const [key, value] of form.entries()) duplicate.append(key, value);
  duplicate.append("logicalName", "ambiguous second value");
  assert.throws(
    () => validateSourceUploadMetadata(duplicate, file),
    (error) => error instanceof SourceUploadMetadataError && error.code === "invalid_upload_metadata",
  );

  const oversized = new FormData();
  for (const [key, value] of form.entries()) oversized.append(key, value);
  oversized.set("projectTitle", "é".repeat(81));
  assert.throws(
    () => validateSourceUploadMetadata(oversized, file),
    (error) => error instanceof SourceUploadMetadataError && /160-byte limit/.test(error.message),
  );

  const unknown = new FormData();
  for (const [key, value] of form.entries()) unknown.append(key, value);
  unknown.set("unmeteredMetadata", "not permitted");
  assert.throws(
    () => validateSourceUploadMetadata(unknown, file),
    (error) => error instanceof SourceUploadMetadataError && error.code === "invalid_upload_metadata",
  );
});

test("direct-upload temporal metadata accepts explicit axes and rejects timeless free text", async () => {
  const file = new File(["hello"], "story.md", { type: "text/markdown" });
  const iso = new FormData();
  iso.set("projectId", "project-one");
  iso.set("file", file);
  iso.set("validFrom", "2026-07-20");
  const metadata = validateSourceUploadMetadata(iso, file);
  assert.equal(metadata.temporalAxis, "date");
  assert.equal(metadata.validFromOrder, 20_654);

  const invalid = await uploadSource(uploadRequest({ validFrom: "sometime after the launch" }));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "unsupported_temporal_marker");

  for (const unsafe of [
    `Day ${"9".repeat(50)}`,
    "Chapter 1000000001",
    "Beat 1.5",
  ]) {
    const rejected = await uploadSource(uploadRequest({ validFrom: unsafe }));
    assert.equal(rejected.status, 400, unsafe);
    assert.equal((await rejected.json()).code, "unsupported_temporal_marker", unsafe);
  }
});

test("the shared reviewed sample rejects upload and repository mutations", async () => {
  const upload = await uploadSource(uploadRequest({
    projectId: "vcs-demo",
    documentType: "narrative",
  }));
  assert.equal(upload.status, 403);
  assert.equal((await upload.json()).code, "shared_sample_read_only");

  const repository = await connectRepository(new Request("https://example.test/api/continuity/repositories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "oai-authenticated-user-email": "reviewer@example.test",
    },
    body: JSON.stringify({ projectId: "vcs-demo", repository: "openai/openai-node" }),
  }));
  // A caller-supplied hosted identity header is rejected before its body is
  // parsed unless the deployment explicitly trusts that authenticated ingress.
  assert.equal(repository.status, 401);
  assert.equal((await repository.json()).code, "trusted_ingress_required");
});

test("legacy filename inference cannot promote a direct upload into runtime truth", () => {
  assert.equal(inferSafeDirectUploadType("manuscript-123.txt"), "narrative");
  assert.equal(inferSafeDirectUploadType("DRAFT-book.pdf"), "proposal");
  assert.equal(inferSafeDirectUploadType("config/runtime.json"), "reference");
  assert.equal(inferSafeDirectUploadType("logs/deployment-audit.csv"), "reference");
});
