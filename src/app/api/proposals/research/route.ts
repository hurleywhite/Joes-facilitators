import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type SlackMessage = {
  text: string;
  user: string;
  ts: string;
  channelName?: string;
  channelId?: string;
};

type ResearchResult = {
  source: "slack" | "none";
  messages: SlackMessage[];
  summary: string;
  channelsSearched: number;
  error?: string;
  helpText?: string;
};

/**
 * Pulls context about a company from Slack.
 *
 * Approach: lists all channels the bot is a member of, then fetches
 * recent messages from each and filters by the query string client-side.
 * This works with bot tokens (which can't use search.messages).
 *
 * The bot must be invited to channels via /invite @Proposal Generator.
 */
export async function POST(req: Request) {
  try {
    const { query } = (await req.json()) as { query: string };
    if (!query?.trim()) {
      return NextResponse.json({
        source: "none",
        messages: [],
        summary: "",
        channelsSearched: 0,
      } as ResearchResult);
    }

    const token =
      process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
    if (!token) {
      return NextResponse.json({
        source: "none",
        messages: [],
        summary: "",
        channelsSearched: 0,
        error: "Slack not connected — set SLACK_BOT_TOKEN in Vercel.",
      } as ResearchResult);
    }

    // 1. List all channels the bot is a member of
    const channels = await listMemberChannels(token);

    if (channels.length === 0) {
      return NextResponse.json({
        source: "slack",
        messages: [],
        summary: "",
        channelsSearched: 0,
        helpText:
          "No channels connected yet. Invite @Proposal Generator to channels you want searchable (e.g., /invite @Proposal Generator in #sales, #prospects, etc.)",
      } as ResearchResult);
    }

    // 2. Fetch recent history from each channel (last 200 messages per channel)
    const queryLower = query.toLowerCase();
    const allMatches: SlackMessage[] = [];

    for (const channel of channels) {
      try {
        const messages = await fetchChannelHistory(token, channel.id, 200);
        for (const msg of messages) {
          if (msg.text?.toLowerCase().includes(queryLower)) {
            allMatches.push({
              text: msg.text,
              user: msg.user || "unknown",
              ts: msg.ts,
              channelName: channel.name,
              channelId: channel.id,
            });
          }
        }
      } catch (err) {
        console.error(`Failed to fetch ${channel.name}:`, err);
      }
    }

    // 3. Sort chronologically and trim to most relevant
    allMatches.sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));
    const topMatches = allMatches.slice(0, 20);

    // 4. Resolve user IDs to names (best effort)
    const userIds = new Set(topMatches.map((m) => m.user).filter(Boolean));
    const userMap = await resolveUserNames(token, Array.from(userIds));

    const enriched = topMatches.map((m) => ({
      ...m,
      user: userMap[m.user] || m.user,
    }));

    const summary = buildSummary(query, enriched);

    return NextResponse.json({
      source: "slack",
      messages: enriched,
      summary,
      channelsSearched: channels.length,
      helpText:
        channels.length > 0
          ? `Searched ${channels.length} channel${channels.length !== 1 ? "s" : ""} the bot is in: ${channels.map((c) => "#" + c.name).join(", ")}`
          : undefined,
    } as ResearchResult);
  } catch (err) {
    return NextResponse.json(
      {
        source: "none",
        messages: [],
        summary: "",
        channelsSearched: 0,
        error: err instanceof Error ? err.message : "Research failed",
      } as ResearchResult,
      { status: 500 }
    );
  }
}

/**
 * Lists channels the bot is a member of.
 */
async function listMemberChannels(
  token: string
): Promise<Array<{ id: string; name: string }>> {
  const channels: Array<{ id: string; name: string }> = [];
  let cursor = "";

  do {
    const url = new URL("https://slack.com/api/conversations.list");
    url.searchParams.set("types", "public_channel,private_channel");
    url.searchParams.set("limit", "200");
    url.searchParams.set("exclude_archived", "true");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!data.ok) {
      // Try just public if private fails
      if (data.error === "missing_scope") {
        const urlPub = new URL("https://slack.com/api/conversations.list");
        urlPub.searchParams.set("types", "public_channel");
        urlPub.searchParams.set("limit", "200");
        urlPub.searchParams.set("exclude_archived", "true");
        const resPub = await fetch(urlPub.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const dataPub = await resPub.json();
        if (dataPub.ok) {
          for (const c of dataPub.channels || []) {
            if (c.is_member) channels.push({ id: c.id, name: c.name });
          }
        }
        return channels;
      }
      throw new Error(`Slack error: ${data.error}`);
    }

    for (const c of data.channels || []) {
      if (c.is_member) channels.push({ id: c.id, name: c.name });
    }

    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);

  return channels;
}

/**
 * Fetches recent message history for a channel.
 */
async function fetchChannelHistory(
  token: string,
  channelId: string,
  limit: number
): Promise<Array<{ text: string; user: string; ts: string }>> {
  const url = new URL("https://slack.com/api/conversations.history");
  url.searchParams.set("channel", channelId);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);
  return data.messages || [];
}

/**
 * Resolves user IDs to display names.
 */
async function resolveUserNames(
  token: string,
  userIds: string[]
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  // Try users.list if we have the scope, otherwise skip
  try {
    const res = await fetch("https://slack.com/api/users.list?limit=500", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.ok) {
      for (const u of data.members || []) {
        map[u.id] = u.real_name || u.name || u.id;
      }
    }
  } catch {
    // Silent fail — we'll just show user IDs
  }

  return map;
}

function buildSummary(query: string, messages: SlackMessage[]): string {
  if (messages.length === 0) {
    return `No Slack messages mentioning "${query}" found in connected channels.`;
  }

  // Order chronologically (oldest first for narrative flow)
  const ordered = [...messages].sort(
    (a, b) => parseFloat(a.ts) - parseFloat(b.ts)
  );

  return ordered
    .map((m) => {
      const date = new Date(parseFloat(m.ts) * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const channel = m.channelName ? `#${m.channelName}` : "";
      const text = m.text
        .replace(/<@[^>]+>/g, "")
        .replace(/<#[^|]+\|([^>]+)>/g, "#$1")
        .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
        .replace(/<([^>]+)>/g, "$1")
        .trim();
      return `${date} ${channel ? `(${channel}) ` : ""}${m.user}: ${text}`;
    })
    .join("\n\n");
}
