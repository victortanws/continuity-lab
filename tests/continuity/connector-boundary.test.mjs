import assert from "node:assert/strict";
import test from "node:test";

import {
  ConnectorExecutionBudget,
  ConnectorExecutionError,
  readConnectorResponseJsonBounded,
} from "../../lib/continuity/http/connector-execution.ts";
import { indexRepositoryPacket } from "../../lib/continuity/providers/openai-repository.ts";

test("connector execution deadlines and call caps fail with typed errors", () => {
  const expired = new ConnectorExecutionBudget({ deadlineAt: Date.now() - 1, maxCalls: 1 });
  assert.throws(
    () => expired.signalFor("expired_phase", 1_000),
    (error) => error instanceof ConnectorExecutionError
      && error.code === "connector_deadline_exceeded"
      && error.httpStatus === 504,
  );

  const capped = new ConnectorExecutionBudget({ deadlineAt: Date.now() + 10_000, maxCalls: 1 });
  capped.signalFor("first", 1_000);
  assert.throws(
    () => capped.signalFor("second", 1_000),
    (error) => error instanceof ConnectorExecutionError
      && error.code === "connector_call_limit_exceeded"
      && error.httpStatus === 503,
  );
});

test("repository OpenAI indexing consumes the caller's shared connector budget without retry", async () => {
  const statusUpdates = [];
  const repository = {
    updateRepositorySnapshotIndexStatus: async (...args) => { statusUpdates.push(["snapshot", ...args]); },
    updateSourceIndexStatus: async (...args) => { statusUpdates.push(["source", ...args]); },
    getProviderBinding: async () => null,
    setProviderBinding: async () => { throw new Error("provider binding should not be reached"); },
  };
  const budget = new ConnectorExecutionBudget({ deadlineAt: Date.now() + 10_000, maxCalls: 1 });
  budget.signalFor("prior_github_call", 1_000);
  let fetchCalls = 0;
  const result = await indexRepositoryPacket({
    repository,
    snapshot: {
      id: "snapshot-1",
      projectId: "project-1",
      commitSha: "a".repeat(40),
    },
    source: {
      id: "source-1",
      projectId: "project-1",
      versionId: "version-1",
      filename: "snapshot.md",
      logicalName: "Snapshot",
      authority: "reference",
      sha256: "b".repeat(64),
    },
    packet: new File(["snapshot"], "snapshot.md", { type: "text/markdown" }),
    projectTitle: "Project",
    apiKey: "test-key",
    executionBudget: budget,
    fetch: async () => {
      fetchCalls += 1;
      throw new Error("fetch must not run after budget exhaustion");
    },
  });

  assert.equal(fetchCalls, 0);
  assert.equal(result.capability, "stored_with_index_error");
  assert.equal(result.errorCode, "connector_call_limit_exceeded");
  assert.equal(statusUpdates.some((entry) => entry.includes("failed")), true);
});

test("connector response readers enforce declared and streamed byte limits before JSON materialization", async () => {
  await assert.rejects(
    () => readConnectorResponseJsonBounded(new Response("{}", {
      headers: { "content-length": "1025" },
    }), 1_024, "test_connector"),
    (error) => error instanceof ConnectorExecutionError
      && error.code === "connector_response_too_large"
      && error.httpStatus === 502,
  );

  const chunked = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"value":"'));
      controller.enqueue(new TextEncoder().encode("x".repeat(2_000)));
      controller.enqueue(new TextEncoder().encode('"}'));
      controller.close();
    },
  });
  await assert.rejects(
    () => readConnectorResponseJsonBounded(new Response(chunked), 1_024, "test_connector"),
    (error) => error instanceof ConnectorExecutionError
      && error.code === "connector_response_too_large",
  );

  const accepted = await readConnectorResponseJsonBounded(
    Response.json({ id: "vs_123" }),
    1_024,
    "test_connector",
  );
  assert.deepEqual(accepted, { id: "vs_123" });
});

test("repository OpenAI indexing fails closed on an oversized provider response", async () => {
  const statusUpdates = [];
  const repository = {
    updateRepositorySnapshotIndexStatus: async (...args) => { statusUpdates.push(["snapshot", ...args]); },
    updateSourceIndexStatus: async (...args) => { statusUpdates.push(["source", ...args]); },
    getProviderBinding: async () => null,
    setProviderBinding: async () => { throw new Error("provider binding should not be reached"); },
  };
  let fetchCalls = 0;
  const result = await indexRepositoryPacket({
    repository,
    snapshot: {
      id: "snapshot-oversize",
      projectId: "project-1",
      commitSha: "a".repeat(40),
    },
    source: {
      id: "source-oversize",
      projectId: "project-1",
      versionId: "version-oversize",
      filename: "snapshot.md",
      logicalName: "Snapshot",
      authority: "reference",
      sha256: "b".repeat(64),
    },
    packet: new File(["snapshot"], "snapshot.md", { type: "text/markdown" }),
    projectTitle: "Project",
    apiKey: "test-key",
    fetch: async () => {
      fetchCalls += 1;
      return new Response("x", {
        status: 200,
        headers: { "content-length": String(256 * 1024 + 1) },
      });
    },
  });

  assert.equal(fetchCalls, 1);
  assert.equal(result.capability, "stored_with_index_error");
  assert.equal(result.errorCode, "connector_response_too_large");
  assert.equal(statusUpdates.some((entry) => entry.includes("failed")), true);
});
