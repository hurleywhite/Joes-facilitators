/**
 * Provider-agnostic LLM tool-call helper.
 *
 * Chat and edit-parse both want the same shape: "send a system prompt +
 * conversation, force one of these tools to be called, parse back the
 * tool name + structured arguments". Anthropic and OpenAI both support
 * that pattern but with different request/response shapes.
 *
 * `callToolModel` normalizes both behind one interface. Provider
 * selection: OPENAI_API_KEY wins; otherwise ANTHROPIC_API_KEY; otherwise
 * the route handles the no-LLM case itself (heuristic fallback).
 *
 * The conventional models below are sensible defaults for May 2026;
 * override with OPENAI_MODEL or ANTHROPIC_MODEL env vars if the team
 * tier is different.
 */

export type ToolDef = {
  name: string;
  description: string;
  /** JSON Schema for the tool inputs. */
  input_schema: Record<string, unknown>;
};

export type LLMMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ToolCall = {
  name: string;
  /** Parsed arguments object. */
  input: Record<string, unknown>;
};

export type CallToolModelRequest = {
  system: string;
  messages: LLMMessage[];
  tools: ToolDef[];
  /** Tool name to force, OR "any" to let the model pick, OR "auto" to allow no tool call. */
  toolChoice: string | "any" | "auto";
  /** Whether multiple tool calls in one response are allowed. */
  allowParallel?: boolean;
  maxTokens?: number;
};

export type CallToolModelResponse = {
  toolCalls: ToolCall[];
  provider: "openai" | "anthropic";
  /** Optional plain-text content if the model didn't tool-call. */
  text?: string;
};

export function hasLLM(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

export async function callToolModel(
  req: CallToolModelRequest
): Promise<CallToolModelResponse> {
  if (process.env.OPENAI_API_KEY) return callOpenAI(req);
  if (process.env.ANTHROPIC_API_KEY) return callAnthropic(req);
  throw new Error(
    "No LLM provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY."
  );
}

/* ------------------------------------------------------------------ */
/* OpenAI                                                              */
/* ------------------------------------------------------------------ */

async function callOpenAI(
  req: CallToolModelRequest
): Promise<CallToolModelResponse> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  // OpenAI: tools are wrapped in {type:"function", function:{...}} and
  // the schema lives under `parameters` (not input_schema).
  const tools = req.tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  const toolChoice =
    req.toolChoice === "any"
      ? "required"
      : req.toolChoice === "auto"
        ? "auto"
        : { type: "function" as const, function: { name: req.toolChoice } };

  const body = {
    model,
    messages: [
      { role: "system" as const, content: req.system },
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    tools,
    tool_choice: toolChoice,
    parallel_tool_calls: req.allowParallel ?? false,
    max_completion_tokens: req.maxTokens ?? 2000,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${errText.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    choices: Array<{
      message: {
        content?: string | null;
        tool_calls?: Array<{
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };

  const msg = data.choices?.[0]?.message;
  const toolCalls: ToolCall[] = (msg?.tool_calls || []).map((tc) => {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
    } catch {
      // bad JSON — return empty input, caller will see name without args
    }
    return { name: tc.function.name, input };
  });

  return {
    toolCalls,
    provider: "openai",
    text: msg?.content || undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Anthropic                                                           */
/* ------------------------------------------------------------------ */

async function callAnthropic(
  req: CallToolModelRequest
): Promise<CallToolModelResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

  const toolChoice =
    req.toolChoice === "any"
      ? { type: "any" as const }
      : req.toolChoice === "auto"
        ? { type: "auto" as const }
        : { type: "tool" as const, name: req.toolChoice };

  const body = {
    model,
    max_tokens: req.maxTokens ?? 2000,
    system: req.system,
    tools: req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    })),
    tool_choice: toolChoice,
    messages: req.messages,
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    content?: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; name: string; input: Record<string, unknown> }
    >;
  };

  const toolCalls: ToolCall[] = [];
  let text: string | undefined;
  for (const block of data.content || []) {
    if (block.type === "tool_use") {
      toolCalls.push({ name: block.name, input: block.input });
    } else if (block.type === "text") {
      text = (text || "") + block.text;
    }
  }
  return { toolCalls, provider: "anthropic", text };
}
