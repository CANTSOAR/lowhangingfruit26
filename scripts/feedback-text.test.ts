import assert from "node:assert/strict";
import test from "node:test";
import {
  briefParts,
  feedbackParts,
  plainFeedbackText,
  validHighlights,
} from "../src/lib/feedback-text";

test("medical aliases are case insensitive, keep original wording and avoid substring matches", () => {
  const text =
    "Ask about polydipsia, nocturnal enuresis and HbA1c. DKA is not DKAlphabet.";
  const parts = feedbackParts(text);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.deepEqual(
    parts.filter((p) => p.term).map((p) => p.term),
    ["polydipsia", "enuresis", "a1c", "dka"],
  );
  assert.equal(
    feedbackParts("Unrecognizedword and polydipsias").filter((p) => p.term)
      .length,
    0,
  );
});
test("action highlights distinguish communication from chart review", () => {
  const parts = feedbackParts(
    "Begin by introducing yourself, then review the prior visit's labs.",
    "actions",
  );
  assert(
    parts.filter(p => p.tone === "communication").map(p => p.text).join("").includes("introducing yourself"),
  );
  assert(
    parts.filter(p => p.tone === "chart").map(p => p.text).join("").includes("prior visit's labs"),
  );
});
test("model highlights require exact snippets and a known tone", () => {
  const text =
    "You **asked an open question**, but **did not set expectations**.";
  const highlights = validHighlights(text, [
    { text: "asked an open question", tone: "positive" },
    { text: "did not set expectations", tone: "negative" },
    { text: "missing phrase", tone: "positive" },
    { text: "You", tone: "invented" },
  ]);
  assert.equal(highlights.length, 2);
  const parts = feedbackParts(text, "rubric", highlights);
  assert.equal(parts.map((p) => p.text).join(""), plainFeedbackText(text));
  assert(parts.some((p) => p.tone === "positive"));
  assert(parts.some((p) => p.tone === "negative"));
});
test("old rubric records show explicit strengths and gaps without painting negated strengths green", () => {
  const text =
    "The student introduced their role and asked an open question, but did not set expectations for the visit.";
  const parts = feedbackParts(text, "rubric");
  assert(parts.some((p) => p.tone === "positive"));
  assert(parts.some((p) => p.tone === "negative"));
  assert(
    !feedbackParts("There was no empathic acknowledgment.", "rubric").some(
      (p) => p.tone === "positive",
    ),
  );
  assert.equal(
    feedbackParts("<script>alert('x')</script>")
      .map((p) => p.text)
      .join(""),
    "<script>alert('x')</script>",
  );
});
test("briefing highlights keep supplied words and focus on reason, timing and tasks", () => {
  const text =
    "You are seeing Helen. She booked the appointment for three months of tiredness. Take a focused history.";
  const parts = briefParts(text);
  assert.equal(parts.map((p) => p.text).join(""), text);
  assert.equal(parts[0].important, false);
  assert(
    parts.some((part) => part.important && /focused history/i.test(part.text)),
  );
  assert(
    parts
      .filter((part) => part.important)
      .map((part) => part.text)
      .join(" ").length <
      text.length / 2,
  );
});
