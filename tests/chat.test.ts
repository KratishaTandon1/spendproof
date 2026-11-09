import test from "node:test";
import assert from "node:assert/strict";
import { toChatMessages } from "../src/shared/chat";

test("native Studio parallel tool calls remain one valid provider message", () => {
  const output = toChatMessages(
    [
      {
        id: "u",
        kind: "input",
        type: "message",
        role: "user",
        status: "completed",
        content: [{ type: "text", text: "Explain my report" }],
      },
      {
        id: "a",
        kind: "output",
        type: "function_call",
        callId: "call-a",
        name: "read_data",
        arguments: "{}",
      },
      {
        id: "b",
        kind: "output",
        type: "function_call",
        callId: "call-b",
        name: "read_layout",
        arguments: "{}",
      },
      {
        type: "function_call_output",
        callId: "call-a",
        output: "data",
        status: "completed",
      },
      {
        type: "function_call_output",
        callId: "call-b",
        output: "layout",
        status: "completed",
      },
    ],
    "Report tools only",
  );
  assert.equal(output.length, 5);
  assert.equal(output[0].role, "system");
  assert.equal(output[2].tool_calls?.length, 2);
  assert.equal(output[3].tool_call_id, "call-a");
  assert.equal(output[4].tool_call_id, "call-b");
});
