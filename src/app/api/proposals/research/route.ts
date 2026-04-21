import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SlackMessage = {
  text: string;
  user: string;
  ts: string;
  channelName?: string;
  channelId?: string;
  isThreadReply?: boolean;
  threadRootTs?: string;
};

type ResearchResult = {
  source: "slack" | "none";
  messages: SlackMessage[];
  summary: string;
  channelsSearched: number;
  error?: string;
  helpText?: string;
};

// Pagination/depth constants
const MAX_MESSAGES_PER_CHANNEL = 2000; // paginate up to this many per channel
const CONTEXT_WINDOW = 3; // N messages before and after each match
const THREAD_REPLY_LIMIT = 100; // messages per thread fetch

/**
 * Pulls deep context about a company from Slack — not just matching messages,
 * but surrounding conversation and full thread replies.
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

    const channels = await listMemberChannels(token);

    if (channels.length === 0) {
      return NextResponse.json({
        source: "slack",
        messages: [],
        summary: "",
        channelsSearched: 0,
        helpText:
          "No channels connected yet. Invite @Proposal Generator to channels you want searchable.",
      } as ResearchResult);
    }

    const queryLower = query.toLowerCase();
    const allContextMessages: SlackMessage[] = [];

    // For each channel, pull a lot of messages, find matches, include surrounding context + thread replies
    for (const channel of channels) {
      try {
        // 1. Get deep history (paginated)
        const messages = await fetchDeepHistory(
          token,
          channel.id,
          MAX_MESSAGES_PER_CHANNEL
        );

        // 2. Find matching message indices
        const matchIndices: number[] = [];
        for (let i = 0; i < messages.length; i++) {
          if (messages[i].text?.toLowerCase().includes(queryLower)) {
            matchIndices.push(i);
          }
        }

        if (matchIndices.length === 0) continue;

        // 3. Build a set of message indices to include (matches + surrounding context)
        const includeSet = new Set<number>();
        for (const idx of matchIndices) {
          for (
            let j = Math.max(0, idx - CONTEXT_WINDOW);
            j <= Math.min(messages.length - 1, idx + CONTEXT_WINDOW);
            j++
          ) {
            includeSet.add(j);
          }
        }

        // 4. Collect those messages
        for (const idx of Array.from(includeSet).sort((a, b) => a - b)) {
          const msg = messages[idx];
          allContextMessages.push({
            text: msg.text || "",
            user: msg.user || "unknown",
            ts: msg.ts,
            channelName: channel.name,
            channelId: channel.id,
          });
        }

        // 5. Fetch thread replies for each match that has a thread
        const threadTsSet = new Set<string>();
        for (const idx of matchIndices) {
          const msg = messages[idx];
          // If message has replies or is itself in a thread
          const threadTs = msg.thread_ts || (msg.reply_count ? msg.ts : null);
          if (threadTs) threadTsSet.add(threadTs);
        }

        for (const threadTs of threadTsSet) {
          try {
            const replies = await fetchThreadReplies(token, channel.id, threadTs);
            for (const reply of replies) {
              allContextMessages.push({
                text: reply.text || "",
                user: reply.user || "unknown",
                ts: reply.ts,
                channelName: channel.name,
                channelId: channel.id,
                isThreadReply: true,
                threadRootTs: threadTs,
              });
            }
          } catch (err) {
            console.error(`Failed to fetch thread ${threadTs}:`, err);
          }
        }
      } catch (err) {
        console.error(`Failed to fetch ${channel.name}:`, err);
      }
    }

    // Deduplicate by ts (some messages might appear in both context and thread replies)
    const seen = new Set<string>();
    const deduped: SlackMessage[] = [];
    for (const m of allContextMessages) {
      const key = `${m.channelId}-${m.ts}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(m);
      }
    }

    // Resolve user names
    const userIds = new Set(deduped.map((m) => m.user).filter(Boolean));
    const userMap = await resolveUserNames(token, Array.from(userIds));

    const enriched = deduped.map((m) => ({
      ...m,
      user: userMap[m.user] || m.user,
    }));

    const summary = buildSummary(query, enriched);

    return NextResponse.json({
      source: "slack",
      messages: enriched,
      summary,
      channelsSearched: channels.length,
      helpText: `Searched ${channels.length} channel${channels.length !== 1 ? "s" : ""}: ${channels.map((c) => "#" + c.name).join(", ")}`,
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
      if (data.error === "missing_scope") {
        // Try public only
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
 * Fetches message history deeply via pagination.
 */
async function fetchDeepHistory(
  token: string,
  channelId: string,
  maxTotal: number
): Promise<
  Array<{
    text: string;
    user: string;
    ts: string;
    thread_ts?: string;
    reply_count?: number;
  }>
> {
  const all: Array<{
    text: string;
    user: string;
    ts: string;
    thread_ts?: string;
    reply_count?: number;
  }> = [];
  let cursor = "";

  do {
    const url = new URL("https://slack.com/api/conversations.history");
    url.searchParams.set("channel", channelId);
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.ok) {
      if (all.length === 0) throw new Error(data.error);
      break;
    }

    for (const m of data.messages || []) {
      all.push(m);
      if (all.length >= maxTotal) return all;
    }

    cursor = data.response_metadata?.next_cursor || "";
    if (!data.has_more) break;
  } while (cursor);

  return all;
}

/**
 * Fetches all replies to a thread.
 */
async function fetchThreadReplies(
  token: string,
  channelId: string,
  threadTs: string
): Promise<Array<{ text: string; user: string; ts: string }>> {
  const url = new URL("https://slack.com/api/conversations.replies");
  url.searchParams.set("channel", channelId);
  url.searchParams.set("ts", threadTs);
  url.searchParams.set("limit", String(THREAD_REPLY_LIMIT));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);
  return data.messages || [];
}

async function resolveUserNames(
  token: string,
  userIds: string[]
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const res = await fetch("https://slack.com/api/users.list?limit=1000", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.ok) {
      for (const u of data.members || []) {
        map[u.id] = u.real_name || u.name || u.id;
      }
    }
  } catch {
    // Silent fail — show IDs instead
  }
  return map;
}

/**
 * Builds a rich, chronologically-ordered summary of all context messages,
 * grouped by channel and thread.
 */
function buildSummary(query: string, messages: SlackMessage[]): string {
  if (messages.length === 0) {
    return `No Slack messages mentioning "${query}" found in connected channels.`;
  }

  // Group by channel
  const byChannel = new Map<string, SlackMessage[]>();
  for (const m of messages) {
    const key = m.channelName || "unknown";
    if (!byChannel.has(key)) byChannel.set(key, []);
    byChannel.get(key)!.push(m);
  }

  const parts: string[] = [];
  for (const [channelName, msgs] of byChannel) {
    // Sort chronologically within channel
    msgs.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

    parts.push(`### From #${channelName}`);
    let lastTs = 0;
    for (const m of msgs) {
      const ts = parseFloat(m.ts);
      const date = new Date(ts * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const time = new Date(ts * 1000).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      const text = cleanSlackFormatting(m.text);

      // Add a visual break if there's a big gap in time (>1 day)
      if (lastTs && ts - lastTs > 86400) {
        parts.push("---");
      }

      const indent = m.isThreadReply ? "    ↳ " : "";
      parts.push(`${indent}${date} ${time} — ${m.user}: ${text}`);
      lastTs = ts;
    }
    parts.push(""); // blank line between channels
  }

  return parts.join("\n");
}

function cleanSlackFormatting(text: string): string {
  return text
    .replace(/<@([A-Z0-9]+)>/g, "@user")
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, "#$1")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .replace(/\n+/g, " ")
    .trim();
}
