import assert from "node:assert/strict";
import test from "node:test";

import { reserveReviewedLiveDemoUsage } from "../../app/api/continuity/query/route.ts";
import { ContinuityRepository } from "../../lib/continuity/storage/repository.ts";

class UsageDb {
  rows = new Map();
  prepare(sql) {
    return {
      bind: (...values) => {
        return {
          run: async () => {
            if (!sql.includes("INSERT INTO usage_windows")) throw new Error("unexpected statement");
            const [scope, operation, start, seconds, limit, amount = 1] = values;
            const key = `${scope}|${operation}|${start}|${seconds}`;
            const count = this.rows.get(key) ?? 0;
            if (count + amount > limit) return { meta: { changes: 0 } };
            this.rows.set(key, count + amount);
            return { meta: { changes: 1 } };
          },
          all: async () => {
            if (!sql.includes("SELECT count FROM usage_windows")) throw new Error("unexpected statement");
            const [scope, operation, start, seconds] = values;
            const count = this.rows.get(`${scope}|${operation}|${start}|${seconds}`);
            return { results: count === undefined ? [] : [{ count }] };
          },
        };
      },
    };
  }
}

test("usage windows stop provider work at the hard request limit", async () => {
  const repository = new ContinuityRepository(new UsageDb());
  const now = Date.UTC(2026, 6, 20, 12, 0, 0);
  assert.equal((await repository.consumeUsage("actor-1", "query_live", 2, 3600, now)).allowed, true);
  assert.equal((await repository.consumeUsage("actor-1", "query_live", 2, 3600, now)).allowed, true);
  const rejected = await repository.consumeUsage("actor-1", "query_live", 2, 3600, now);
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.count, 2);
  assert.ok(rejected.retryAfterSeconds > 0);
});

test("usage windows support byte-weighted actor quotas across project labels", async () => {
  const repository = new ContinuityRepository(new UsageDb());
  const now = Date.UTC(2026, 6, 20, 12, 0, 0);
  assert.equal((await repository.consumeUsage("actor-1", "source_upload_mib", 5, 86400, now, 3)).allowed, true);
  const rejected = await repository.consumeUsage("actor-1", "source_upload_mib", 5, 86400, now, 3);
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.count, 3);
  assert.equal((await repository.consumeUsage("actor-2", "source_upload_mib", 5, 86400, now, 3)).allowed, true);
});

test("reviewed live reservations persist across requests and enforce actor then project ceilings", async () => {
  const db = new UsageDb();
  const now = Date.UTC(2026, 6, 20, 12, 0, 0);
  const limits = { actorPerDay: 2, projectPerDay: 3 };

  assert.equal((await reserveReviewedLiveDemoUsage(
    new ContinuityRepository(db), "actor-a", limits, now,
  )).allowed, true);
  assert.equal((await reserveReviewedLiveDemoUsage(
    new ContinuityRepository(db), "actor-a", limits, now,
  )).allowed, true);

  const actorDenied = await reserveReviewedLiveDemoUsage(
    new ContinuityRepository(db), "actor-a", limits, now,
  );
  assert.equal(actorDenied.allowed, false);
  assert.equal(actorDenied.blockedRuleId, "actor_project_daily");

  assert.equal((await reserveReviewedLiveDemoUsage(
    new ContinuityRepository(db), "actor-b", limits, now,
  )).allowed, true);
  const projectDenied = await reserveReviewedLiveDemoUsage(
    new ContinuityRepository(db), "actor-b", limits, now,
  );
  assert.equal(projectDenied.allowed, false);
  assert.equal(projectDenied.blockedRuleId, "project_global_daily");
  assert.ok(projectDenied.retryAfterSeconds > 0);

  const windowStart = Math.floor(now / 1_000 / 86_400) * 86_400;
  const globalKey = `project-vcs-demo:global|reviewed_live_demo|${windowStart}|86400`;
  assert.equal(db.rows.get(globalKey), 3);
});

test("reviewed live reservation fails closed when durable storage is unavailable", async () => {
  const unavailable = {
    prepare() {
      return {
        bind() {
          return {
            run: async () => { throw new Error("D1 unavailable"); },
            all: async () => { throw new Error("D1 unavailable"); },
          };
        },
      };
    },
  };
  await assert.rejects(
    () => reserveReviewedLiveDemoUsage(
      new ContinuityRepository(unavailable),
      "actor-a",
      { actorPerDay: 2, projectPerDay: 3 },
      Date.UTC(2026, 6, 20, 12, 0, 0),
    ),
    /D1 unavailable/,
  );
});
