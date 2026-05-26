/**
 * Claude-based bio enrichment using web search.
 *
 * When ANTHROPIC_API_KEY is set, uses Claude with web search tool to
 * generate a real bio based on the person's actual public presence
 * (LinkedIn, personal site, conference talks, etc.).
 *
 * Cached per serverless instance.
 */

const cache = new Map<string, string | null>();

type ClaudeMessageContent = Array<
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
>;

export async function enrichBioWithClaude(
  name: string,
  linkedinUrl: string,
  location?: string
): Promise<string | null> {
  const key = `${name}|${linkedinUrl}`;
  if (cache.has(key)) return cache.get(key)!;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const tools = [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3,
      },
    ];

    const prompt = `Find a brief, factual professional bio for this AI workshop facilitator/trainer:

Name: ${name}
${location ? `Location: ${location}` : ""}
${linkedinUrl ? `LinkedIn: ${linkedinUrl}` : ""}

Use web search to find their actual professional details (current role, focus areas, notable engagements, expertise). Then write a 2-3 sentence bio in this voice:

- Direct and confident, no fluff
- Lead with their primary professional identity
- Mention their specific focus area (AI training, facilitation, technical, etc.)
- Include 1-2 concrete credentials or experience markers
- Match the style: "Senior AI facilitator with 10+ years at companies like X. Specializes in Y. Has delivered programs for Z."

Return ONLY the bio text, no preamble, no labels, no quotes around it. If you can't find them, return the literal string "NOT_FOUND".`;

    const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
      { role: "user", content: prompt },
    ];
    let bio: string | null = null;

    for (let iter = 0; iter < 5; iter++) {
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
          tools,
          messages,
        }),
      });

      if (!res.ok) break;
      const data = await res.json();

      // Append the assistant message
      messages.push({ role: "assistant", content: data.content });

      // Look for final text response
      let foundText = "";
      let calledTool = false;
      for (const block of data.content || []) {
        if (block.type === "text" && block.text) {
          foundText += block.text;
        }
        if (block.type === "tool_use") {
          calledTool = true;
        }
      }

      if (data.stop_reason === "end_turn" && foundText.trim()) {
        bio = foundText.trim();
        break;
      }

      // If tool calls are pending, the API server side already executed them
      if (!calledTool) break;
    }

    if (!bio || bio.includes("NOT_FOUND") || bio.length < 30) {
      cache.set(key, null);
      return null;
    }

    cache.set(key, bio);
    return bio;
  } catch {
    cache.set(key, null);
    return null;
  }
}
