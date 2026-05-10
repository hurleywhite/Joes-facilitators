import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Parses a natural-language note into a structured edit action that the
 * /api/edit/apply route can forward to the Apps Script. We deliberately
 * DON'T apply the edit here — the UI shows a preview and waits for an
 * explicit Confirm click before /apply runs.
 *
 * Supported actions (kept small on purpose — every action that mutates
 * a real customer-facing sheet is a permission expansion):
 *
 *   add_engagement
 *     { kind: "add_engagement", name, client?, status?, location?,
 *       startDate?, endDate?, type?, facilitators?: string[] }
 *
 *   add_facilitator_to_engagement
 *     { kind: "add_facilitator_to_engagement", engagement, facilitator }
 *
 *   update_engagement_status
 *     { kind: "update_engagement_status", engagement, status }
 *
 *   add_facilitator_note
 *     { kind: "add_facilitator_note", facilitator, note }
 *
 *   update_facilitator_field
 *     { kind: "update_facilitator_field", facilitator, field, value }
 *     where `field` is one of: location, focus, tier, availability,
 *     industries (semicolon list), languages (semicolon list)
 *
 * If the input doesn't match any action cleanly, action=null and the
 * UI shows the model's clarifying question.
 */

type EditAction =
  | { kind: "add_engagement"; name: string; client?: string; status?: string; location?: string; startDate?: string; endDate?: string; type?: string; facilitators?: string[]; notes?: string }
  | { kind: "add_facilitator_to_engagement"; engagement: string; facilitator: string }
  | { kind: "update_engagement_status"; engagement: string; status: string }
  | { kind: "add_facilitator_note"; facilitator: string; note: string }
  | { kind: "update_facilitator_field"; facilitator: string; field: string; value: string };

type ParseResponse = {
  action: EditAction | null;
  preview: string;
  needsClarification?: string;
};

export async function POST(req: Request) {
  let body: { note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const note = (body.note || "").trim();
  if (!note) {
    return NextResponse.json(
      { error: "Note is required." },
      { status: 400 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY missing. Add it to Vercel env to enable the edit chatbot.",
      },
      { status: 500 }
    );
  }

  // Tool definitions — Claude must pick exactly one. The system prompt
  // tells the model that "ambiguous" is a valid outcome — in that case
  // it calls `needs_clarification` and we surface the question to the
  // user instead of writing anything.
  const tools = [
    {
      name: "add_engagement",
      description:
        "Add a new row to the Engagements tab. Use when the user describes a NEW engagement — workshop, training, deal — with at least an engagement title or client name.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Engagement title (e.g. 'AI Workshop'). If user only gives client, set name = client." },
          client: { type: "string" },
          status: {
            type: "string",
            enum: ["Active", "Upcoming", "Completed", "Cancelled", "On Hold"],
          },
          location: { type: "string" },
          startDate: { type: "string", description: "YYYY-MM-DD if specified" },
          endDate: { type: "string", description: "YYYY-MM-DD if specified" },
          type: { type: "string", description: "Workshop, Training, etc." },
          facilitators: {
            type: "array",
            items: { type: "string" },
            description:
              "Facilitator full names if the user mentioned anyone staffed on it.",
          },
          notes: { type: "string" },
        },
        required: ["name"],
      },
    },
    {
      name: "add_facilitator_to_engagement",
      description:
        "Append a facilitator's name to an existing engagement's Facilitators column. Use when the user says 'add Ryan to the Tamkeen engagement' style.",
      input_schema: {
        type: "object",
        properties: {
          engagement: {
            type: "string",
            description:
              "Engagement title or client name as it appears in the sheet.",
          },
          facilitator: { type: "string" },
        },
        required: ["engagement", "facilitator"],
      },
    },
    {
      name: "update_engagement_status",
      description: "Change an existing engagement's Status cell.",
      input_schema: {
        type: "object",
        properties: {
          engagement: { type: "string" },
          status: {
            type: "string",
            enum: ["Active", "Upcoming", "Completed", "Cancelled", "On Hold"],
          },
        },
        required: ["engagement", "status"],
      },
    },
    {
      name: "add_facilitator_note",
      description:
        "Append a free-text note to a facilitator's Notes column (preserves existing notes, joins with newline).",
      input_schema: {
        type: "object",
        properties: {
          facilitator: { type: "string" },
          note: { type: "string" },
        },
        required: ["facilitator", "note"],
      },
    },
    {
      name: "update_facilitator_field",
      description:
        "Set a single field on a facilitator's row. Use for availability changes, focus shifts, location updates, etc.",
      input_schema: {
        type: "object",
        properties: {
          facilitator: { type: "string" },
          field: {
            type: "string",
            enum: [
              "Location",
              "Focus",
              "Tier",
              "Availability",
              "Industry Experience",
              "Languages",
              "Email",
              "LinkedIn URL",
            ],
          },
          value: { type: "string" },
        },
        required: ["facilitator", "field", "value"],
      },
    },
    {
      name: "needs_clarification",
      description:
        "Return when the user's note is ambiguous — multiple matching engagements, missing facilitator name, etc. Provide a short question.",
      input_schema: {
        type: "object",
        properties: {
          question: { type: "string" },
        },
        required: ["question"],
      },
    },
  ];

  const systemPrompt =
    "You convert short operator notes into one structured edit on the ArcticMind facilitator pool spreadsheet.\n\n" +
    "Rules:\n" +
    "- Pick EXACTLY ONE tool. Never call multiple. Multi-step edits aren't supported yet.\n" +
    "- If the note is ambiguous (e.g. 'mark the workshop as done' but multiple workshops exist) call `needs_clarification` with a short question.\n" +
    "- Only invent values for fields the user mentioned. Leave optional fields blank.\n" +
    "- Status values must be one of: Active, Upcoming, Completed, Cancelled, On Hold.\n" +
    "- Dates: convert relative phrases ('next Tuesday', 'June') to YYYY-MM-DD when reasonable, otherwise leave blank.\n" +
    "- Facilitator and engagement names should be returned as the user wrote them — the apply route does the fuzzy match against the sheet.";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 800,
      system: systemPrompt,
      tools,
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: note }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json(
      { error: `Claude API ${res.status}: ${errText.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const data = await res.json();
  const toolUse = (data.content || []).find(
    (b: { type: string }) => b.type === "tool_use"
  ) as { type: "tool_use"; name: string; input: Record<string, unknown> } | undefined;

  if (!toolUse) {
    return NextResponse.json({
      action: null,
      preview: "",
      needsClarification:
        "I couldn't pick an action for that note. Try again with a clearer instruction.",
    } satisfies ParseResponse);
  }

  if (toolUse.name === "needs_clarification") {
    return NextResponse.json({
      action: null,
      preview: "",
      needsClarification: String(toolUse.input.question || "Could you clarify?"),
    } satisfies ParseResponse);
  }

  const action = { kind: toolUse.name, ...toolUse.input } as EditAction;
  const preview = previewLine(action);
  return NextResponse.json({ action, preview } satisfies ParseResponse);
}

function previewLine(a: EditAction): string {
  switch (a.kind) {
    case "add_engagement":
      return `Add new engagement: "${a.name}"${a.client && a.client !== a.name ? ` for ${a.client}` : ""}${a.location ? ` (${a.location})` : ""}${a.status ? ` · ${a.status}` : ""}${a.facilitators?.length ? ` · staffed: ${a.facilitators.join(", ")}` : ""}`;
    case "add_facilitator_to_engagement":
      return `Add ${a.facilitator} to the "${a.engagement}" engagement.`;
    case "update_engagement_status":
      return `Change "${a.engagement}" status to ${a.status}.`;
    case "add_facilitator_note":
      return `Append note to ${a.facilitator}: "${a.note}"`;
    case "update_facilitator_field":
      return `Set ${a.facilitator}'s ${a.field} to "${a.value}".`;
  }
}
