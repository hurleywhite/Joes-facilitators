import { NextResponse } from "next/server";
import { ProposalInput } from "@/types/proposal";
import { generateProposal } from "@/data/proposal-template";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      input: ProposalInput;
      enhance?: boolean;
    };

    // Generate the base proposal from template
    let proposal = generateProposal(body.input);

    // Optionally enhance narrative sections with Claude API
    if (body.enhance && process.env.ANTHROPIC_API_KEY) {
      proposal = await enhanceWithClaude(proposal, body.input);
    }

    return NextResponse.json({ proposal });
  } catch (err) {
    console.error("Proposal generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate" },
      { status: 500 }
    );
  }
}

/**
 * Uses Claude API to enhance the narrative sections (Executive Summary,
 * Context, Why ArcticBlue) with client-specific language.
 */
async function enhanceWithClaude(
  proposal: ReturnType<typeof generateProposal>,
  input: ProposalInput
) {
  const apiKey = process.env.ANTHROPIC_API_KEY!;

  // Sections that benefit most from LLM enhancement
  const sectionsToEnhance = new Set([
    "Executive Summary",
    "Context & Opportunity",
    "Why ArcticBlue",
  ]);

  const enhancedSections = await Promise.all(
    proposal.sections.map(async (section) => {
      if (!sectionsToEnhance.has(section.heading)) return section;

      try {
        const enhanced = await callClaude(apiKey, section, input);
        return { ...section, content: enhanced };
      } catch (err) {
        console.error(`Failed to enhance ${section.heading}:`, err);
        return section; // fall back to template content
      }
    })
  );

  return { ...proposal, sections: enhancedSections };
}

async function callClaude(
  apiKey: string,
  section: { heading: string; content: string[] },
  input: ProposalInput
): Promise<string[]> {
  const prompt = `You are writing a section of a client-ready proposal for ArcticBlue, an AI training/consulting company. Rewrite the "${section.heading}" section to be specific to this client and engagement. Keep ArcticBlue's confident, direct voice — no hedging, no generic buzzwords. Match the style of top management consulting proposals.

CLIENT: ${input.clientName}${input.partnerName ? ` (via ${input.partnerName})` : ""}
CONTEXT: ${input.clientContext}
CURRENT STATE: ${input.currentState.join("; ")}
DELIVERY: ${input.deliveryMonth} in ${input.location}

CURRENT DRAFT:
${section.content.join("\n\n")}

Return 2-3 polished paragraphs as JSON in this exact format:
{"paragraphs": ["paragraph 1...", "paragraph 2..."]}

Do not include any other text — just the JSON.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}`);

  const data = await res.json();
  const text = data.content?.[0]?.text?.trim() || "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");

  const parsed = JSON.parse(match[0]);
  return parsed.paragraphs || section.content;
}
