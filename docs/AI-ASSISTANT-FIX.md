# Report-assistant reliability

**Deployed and verified: 9 November 2026.** The native Studio report assistant now completes the previously failing decision-summary query on the public application.

## Failure mode

Groq returned HTTP 400 with `tool_use_failed` when a generated `inspect_workspace` call omitted its required `table` argument. The rejected completion executed no tool, but previously ended the report conversation with a generic provider-access error.

## Implemented behavior

The provider adapter retries that specific rejected completion once with schema feedback and temperature zero. Both attempts share one 40-second deadline. Tool schemas and provider validation remain enabled; invalid arguments are not executed.

Rate limits, authentication failures, other provider errors, and network failures do not trigger this retry. A second invalid completion produces a specific tool-argument error. The inspection-tool description also names the valid table values and explains an empty result.

Four regression tests cover successful correction, the two-attempt bound, preserved validation, and non-retryable failures. A real Groq response completed the empty-workspace query locally; a post-deployment Incognito query successfully summarized the hosted purchase record and distinguished it from a completed payment.

Implementation: [provider adapter](../src/server/providers.ts), [Studio report tools](../src/ui/reportTools.ts), and [regression tests](../tests/providers.test.ts). Provider reference: [Groq local tool calling](https://console.groq.com/docs/tool-use/local-tool-calling).
