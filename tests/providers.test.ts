import test from "node:test";
import assert from "node:assert/strict";
import { groqChat, ServiceError, type Env } from "../src/server/providers";
const env = { GROQ_API_KEY: "test-only-groq-key" } as Env;
const tools = [
  {
    type: "function",
    function: {
      name: "inspect_workspace",
      parameters: {
        type: "object",
        properties: { table: { type: "string" } },
        required: ["table"],
      },
    },
  },
];
const messages = [{ role: "user", content: "Explain my decisions" }];
const invalid = () =>
  Response.json({ error: { code: "tool_use_failed" } }, { status: 400 });
test("invalid tool arguments retry once without relaxing validation", async (t) => {
  const calls: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: any) => {
    calls.push({ body: JSON.parse(init.body), signal: init.signal });
    return calls.length === 1
      ? invalid()
      : Response.json({
          choices: [{ message: { content: "No purchases yet." } }],
        });
  });
  const answer = await groqChat(env, messages, tools);
  assert.equal(answer.choices[0].message.content, "No purchases yet.");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].body.tools, tools);
  assert.equal(calls[1].body.tool_choice, "auto");
  assert.notEqual(calls[1].body.disable_tool_validation, true);
  assert.equal(calls[0].signal, calls[1].signal);
  assert.equal(calls[1].body.temperature, 0);
  assert.match(
    calls[1].body.messages.at(-1).content,
    /required table argument/,
  );
  assert.equal(messages.length, 1);
});
test("repeated invalid tool calls stop after two requests", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    return invalid();
  });
  await assert.rejects(
    groqChat(env, messages, tools),
    (e: unknown) => e instanceof ServiceError && e.code === "AI_TOOL_ARGUMENTS",
  );
  assert.equal(count, 2);
});
test("quota, authentication and other errors do not retry", async (t) => {
  for (const status of [429, 401, 400, 500]) {
    let count = 0;
    const mock = t.mock.method(globalThis, "fetch", async () => {
      count++;
      return Response.json({ error: { code: "other" } }, { status });
    });
    await assert.rejects(
      groqChat(env, messages, tools),
      (e: unknown) =>
        e instanceof ServiceError &&
        e.code === "AI_PROVIDER" &&
        e.status === (status === 429 ? 429 : 502),
    );
    assert.equal(count, 1);
    mock.mock.restore();
  }
});
test("network errors do not retry", async (t) => {
  let count = 0;
  t.mock.method(globalThis, "fetch", async () => {
    count++;
    throw TypeError("network unavailable");
  });
  await assert.rejects(
    groqChat(env, messages, tools),
    (e: unknown) => e instanceof ServiceError && e.code === "AI_NETWORK",
  );
  assert.equal(count, 1);
});
