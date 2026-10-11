import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import GeneratedText from "../src/components/learning/GeneratedText";
import { ScoreGauge } from "../src/components/learning/Patient";
import { plainSpeech, stripStageCues, PROSE_EMPHASIS } from "../src/lib/text-format";
import { chatText, chatJSON, chatStream } from "../src/lib/llm";

test("speech keeps emphasized clinical words while removing stage cues, including streamed partial markers", () => {
  assert.equal(plainSpeech("*looks away* I've felt **short of breath** for **three days**."), "I've felt short of breath for three days.");
  assert.equal(plainSpeech("I have **chest pain"), "I have chest pain");
  assert.equal(plainSpeech("I have **chest pain**"), "I have chest pain");
  assert.equal(stripStageCues("**three days** *looks away* and *sighs*", true), "**three days** *looks away* and  ");
  assert.equal(stripStageCues("**three days** *looks away*"), "**three days**  ");
});

test("dialogue renders emphasis and cues as escaped React text, without interpreting HTML", () => {
  const html = renderToStaticMarkup(React.createElement(GeneratedText, { text: "**chest pain** *looks away* <img src=x onerror=alert(1)>", cues: true }));
  assert.match(html, /<strong[^>]*>chest pain<\/strong>/);
  assert.match(html, /<em[^>]*>looks away<\/em>/);
  assert.match(html, /&lt;img/);
  assert(!html.includes("<img"));
  assert.equal(renderToStaticMarkup(React.createElement(GeneratedText, { text: "Unfinished **phrase" })), "Unfinished **phrase");
});

test("released score gauges distinguish low, middle and high scores and clamp their range", () => {
  for (const [value, score, color] of [[29,29,"#e11d48"], [50,50,"#b77900"], [75,75,"#059669"], [105,100,"#059669"]] as const) {
    const html = renderToStaticMarkup(React.createElement(ScoreGauge, { value }));
    assert(html.includes(`Visit score: ${score}%`));
    assert(html.includes(`stroke="${color}"`));
    assert(html.includes(`stroke-dasharray="${score} 100"`));
  }
  const zero = renderToStaticMarkup(React.createElement(ScoreGauge, { value: -5 }));
  assert(zero.includes("Visit score: 0%"));
  assert(!zero.includes("stroke-dasharray"));
});

test("all three Bedrock wrappers request prose emphasis; classifiers opt out without altering schemas or results", async (t) => {
  // Intercept the SDK before it resolves credentials or makes any network call.
  const send = t.mock.method(BedrockRuntimeClient.prototype, "send", async (command: { input: { toolConfig?: unknown } }) => {
    if (command.input.toolConfig) return { output: { message: { content: [{ toolUse: { input: { id: "fact_1", quote: "exact words", summary: "**Grounded summary**" } } }] } } };
    return { output: { message: { content: [{ text: "**three days**" }] } }, stream: (async function* () { yield { contentBlockDelta: { delta: { text: "**three days**" } } }; })() };
  });
  const base = { system: "Test task", messages: [{ role: "user" as const, text: "Test input" }] };
  assert.equal(await chatText(base), "**three days**");
  let streamed = "";
  for await (const part of chatStream(base)) streamed += part;
  assert.equal(streamed, "**three days**");
  const schema = { type: "object", properties: { id: { type: "string" }, quote: { type: "string" }, summary: { type: "string" } } };
  const result = await chatJSON({ ...base, schema });
  assert.deepEqual(result, { id: "fact_1", quote: "exact words", summary: "**Grounded summary**" });
  await chatJSON({ ...base, schema, emphasis: false });
  const inputs = send.mock.calls.map(c => c.arguments[0].input) as unknown as { system: { text: string }[]; toolConfig?: { tools: { toolSpec: { inputSchema: { json: unknown } } }[] } }[];
  for (const input of inputs.slice(0, 3)) assert(input.system[0].text.includes(PROSE_EMPHASIS));
  assert(!inputs[3].system[0].text.includes(PROSE_EMPHASIS));
  assert.deepEqual(inputs[3].toolConfig?.tools[0].toolSpec.inputSchema.json, schema);
});
