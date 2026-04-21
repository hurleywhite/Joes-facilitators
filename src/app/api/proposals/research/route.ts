import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type SlackMessage = {
  text: string;
  user: string;
  ts: string;
  channel?: { name: string; id: string };
  permalink?: string;
};

type ResearchResult = {
  source: "slack" | "none";
  messages: SlackMessage[];
  summary: string;
  error?: string;
};

/**
 * Pulls context about a company from connected sources (Slack for now).
 * POST { query: "Company Name" }
 */
export async function POST(req: Request) {
  try {
    const { query } = (await req.json()) as { query: string };
    if (!query?.trim()) {
      return NextResponse.json({ source: "none", messages: [], summary: "" });
    }

    const token = process.env.SLACK_USER_TOKEN;
    if (!token) {
      return NextResponse.json({
        source: "none",
        messages: [],
        summary: "",
        error: "Slack not connected — set SLACK_USER_TOKEN in Vercel to enable context pulling.",
      } as ResearchResult);
    }

    // Search Slack for messages mentioning the company
    const searchUrl = new URL("https://slack.com/api/search.messages");
    searchUrl.searchParams.set("query", query);
    searchUrl.searchParams.set("count", "20");
    searchUrl.searchParams.set("sort", "timestamp");
    searchUrl.searchParams.set("sort_dir", "desc");

    const res = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();

    if (!data.ok) {
      const error =
        data.error === "token_expired"
          ? "Slack token expired — rotate/refresh it and update SLACK_USER_TOKEN in Vercel."
          : data.error === "invalid_auth"
            ? "Slack token invalid — check SLACK_USER_TOKEN in Vercel."
            : `Slack API: ${data.error}`;
      return NextResponse.json({
        source: "slack",
        messages: [],
        summary: "",
        error,
      } as ResearchResult);
    }

    const matches = (data.messages?.matches || []) as Array<{
      text: string;
      user: string;
      username?: string;
      ts: string;
      channel?: { name: string; id: string };
      permalink?: string;
    }>;

    const messages: SlackMessage[] = matches.slice(0, 15).map((m) => ({
      text: m.text,
      user: m.username || m.user || "unknown",
      ts: m.ts,
      channel: m.channel,
      permalink: m.permalink,
    }));

    // Build a concise summary Joe can paste directly into the context field
    const summary = buildSummary(query, messages);

    return NextResponse.json({
      source: "slack",
      messages,
      summary,
    } as ResearchResult);
  } catch (err) {
    return NextResponse.json(
      {
        source: "none",
        messages: [],
        summary: "",
        error: err instanceof Error ? err.message : "Research failed",
      } as ResearchResult,
      { status: 500 }
    );
  }
}

/**
 * Builds a concise context summary from Slack messages.
 * Orders messages chronologically and formats each as a dated entry.
 */
function buildSummary(query: string, messages: SlackMessage[]): string {
  if (messages.length === 0) {
    return `No Slack mentions found for "${query}".`;
  }

  const ordered = [...messages].sort(
    (a, b) => parseFloat(a.ts) - parseFloat(b.ts)
  );

  const lines = ordered.map((m) => {
    const date = new Date(parseFloat(m.ts) * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const channel = m.channel?.name ? `#${m.channel.name}` : "";
    const text = m.text
      .replace(/<@[^>]+>/g, "")
      .replace(/<#[^|]+\|([^>]+)>/g, "#$1")
      .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
      .replace(/<([^>]+)>/g, "$1")
      .trim();
    return `${date} ${channel ? `(${channel}) ` : ""}${m.user}: ${text}`;
  });

  return lines.join("\n\n");
}
