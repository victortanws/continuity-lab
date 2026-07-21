import { runReviewedLiveDemo } from "../app/api/continuity/query/route.ts";

const apiKey = process.env.OPENAI_API_KEY?.trim();

if (!apiKey) {
  console.error("OPENAI_API_KEY is not set. Export it in this terminal, then run npm run demo:api again.");
  process.exitCode = 1;
} else {
  const startedAt = Date.now();
  const result = await runReviewedLiveDemo(apiKey, {
    deadlineAt: startedAt + 60_000,
  });

  console.log(JSON.stringify({
    model: "gpt-5.6-sol",
    elapsedMs: Date.now() - startedAt,
    question: "Can the player earn and pay $47,000 in the current prototype?",
    result,
  }, null, 2));
}
