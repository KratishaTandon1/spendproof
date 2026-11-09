import type { AgAiConversationItem } from "ag-studio";

export interface ChatMessage {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
}

/** AG stores each call separately; Chat Completions groups parallel calls in one message. */
export function toChatMessages(
  input: AgAiConversationItem[],
  instructions?: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (instructions) messages.push({ role: "system", content: instructions });
  let calls: NonNullable<ChatMessage["tool_calls"]> = [];
  const flush = () => {
    if (calls.length) {
      messages.push({ role: "assistant", content: null, tool_calls: calls });
      calls = [];
    }
  };
  for (const item of input) {
    if (item.type === "function_call") {
      calls.push({
        id: item.callId,
        type: "function",
        function: { name: item.name, arguments: item.arguments },
      });
      continue;
    }
    flush();
    if (item.type === "message")
      messages.push({
        role: item.role,
        content: item.content
          .map((c) => ("text" in c ? c.text : ""))
          .join("\n"),
      });
    else if (item.type === "function_call_output")
      messages.push({
        role: "tool",
        tool_call_id: item.callId,
        content: item.output,
      });
  }
  flush();
  return messages;
}
