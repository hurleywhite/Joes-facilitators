import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SlackChannel = { id: string; name: string };

type SlackMessage = {
  text: string;
  user: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  channelName?: string;
  channelId?: string;
};

type ResearchResult = {
  source: "slack" | "none";
  summary: string; // the synthesized deal brief
  rawMessages: SlackMessage[]; // for debugging/inspection
  channelsSearched: number;
  usedAgent: boolean;
  error?: string;
  helpText?: string;
};

/**
 * Agentic Slack research:
 *   If ANTHROPIC_API_KEY is set → Claude uses tools iteratively to find,
 *   read, and summarize ONLY the deal-relevant context.
 *
 *   If no key → falls back to thread-only filtering (no surrounding noise).
 */
export async function POST(req: Request) {
  try {
    const { query } = (await req.json()) as { query: string };
    if (!query?.trim()) {
      return NextResponse.json(emptyResult());
    }

    const token =
      process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN;
    if (!token) {
      return NextResponse.json({
        ...emptyResult(),
        error: "Slack not connected — set SLACK_BOT_TOKEN in Vercel.",
      });
    }

    const channels = await listMemberChannels(token);
    if (channels.length === 0) {
      return NextResponse.json({
        ...emptyResult(),
        source: "slack",
        helpText:
          "No channels connected yet. Invite @Proposal Generator to channels you want searchable.",
      });
    }

    const userMap = await resolveUserNames(token);

    // Use Claude agent if key is available, otherwise fall back to heuristic
    if (process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        await runAgenticResearch(query, token, channels, userMap)
      );
    }

    return NextResponse.json(
      await runHeuristicResearch(query, token, channels, userMap)
    );
  } catch (err) {
    return NextResponse.json(
      {
        ...emptyResult(),
        error: err instanceof Error ? err.message : "Research failed",
      },
      { status: 500 }
    );
  }
}

function emptyResult(): ResearchResult {
  return {
    source: "none",
    summary: "",
    rawMessages: [],
    channelsSearched: 0,
    usedAgent: false,
  };
}

// -----------------------------------------------------------------------------
// AGENT MODE — Claude iteratively researches with tool use
// -----------------------------------------------------------------------------

async function runAgenticResearch(
  query: string,
  token: string,
  channels: SlackChannel[],
  userMap: Record<string, string>
): Promise<ResearchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const gatheredMessages: SlackMessage[] = [];

  const tools = [
    {
      name: "search_slack",
      description:
        "Search connected Slack channels for messages containing a keyword. Returns up to 50 matches with channel, timestamp, thread info, and text. Use this to find mentions of people, companies, topics.",
      input_schema: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description:
              "Keyword to search for. Can be a company name, person's name, project, or topic. Searches case-insensitively.",
          },
        },
        required: ["keyword"],
      },
    },
    {
      name: "get_thread",
      description:
        "Fetch the full thread of replies for a given channel + thread timestamp. Use this to read the full conversation around a matching message.",
      input_schema: {
        type: "object",
        properties: {
          channel_id: { type: "string" },
          thread_ts: { type: "string" },
        },
        required: ["channel_id", "thread_ts"],
      },
    },
    {
      name: "done",
      description:
        "Call this when you have gathered enough context. Provide your synthesized deal brief as the 'summary' argument. The brief should focus only on what is directly relevant to drafting a proposal: people involved on the client side, engagement type, scope, timeline, pricing mentions, and current deal stage. Skip generic AI discussion and internal operational chatter.",
      input_schema: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description:
              "Deal-focused brief, 3-6 bullet points or short paragraphs. Cite dates/channels inline where relevant.",
          },
        },
        required: ["summary"],
      },
    },
  ];

  const systemPrompt = `You are a research agent for ArcticBlue AI's proposal generator. Your job is to find out what we know about a specific deal or opportunity by iteratively searching Slack.

GOAL: Produce a tight, proposal-ready brief about the "${query}" opportunity.

APPROACH:
1. Start by searching for "${query}" directly.
2. Read results. Identify key people, related projects, or related keywords to dig deeper.
3. If a matching message is part of a thread, fetch the thread to get the full conversation.
4. Search for adjacent terms you discover (e.g., if you find the client contact name, search for that).
5. When you have enough context, call the "done" tool with a focused brief.

WHAT TO INCLUDE IN THE BRIEF:
- Client-side people involved (names, roles, relationship)
- Deal stage (first conversation, proposal sent, negotiating, etc.)
- Engagement type being discussed (exec workshop, full program, 1:1, etc.)
- Timeline mentions (when they want to start)
- Budget / pricing mentions
- Key requirements or constraints
- Who at ArcticBlue is driving the deal

WHAT TO EXCLUDE:
- Generic AI/tooling discussion not specific to this deal
- Unrelated channel chatter
- Internal tech setup conversations
- Duplicate information

Be concise. Focus only on what helps draft the proposal.

You have a budget of 8 tool calls. Use them wisely.`;

  const messages: Array<{ role: "user" | "assistant"; content: unknown }> = [
    { role: "user", content: `Research the "${query}" opportunity.` },
  ];

  const MAX_ITERATIONS = 8;
  let finalSummary = "";

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2000,
        system: systemPrompt,
        tools,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Claude API ${res.status}: ${errText}`);
    }

    const data = await res.json();

    // Append assistant response to history
    messages.push({ role: "assistant", content: data.content });

    // Check if we're done
    let toolUsed = false;
    const toolResults: Array<{
      type: "tool_result";
      tool_use_id: string;
      content: string;
    }> = [];

    for (const block of data.content || []) {
      if (block.type === "tool_use") {
        toolUsed = true;
        const { name, input, id } = block;

        if (name === "done") {
          finalSummary = (input as { summary: string }).summary || "";
          break;
        } else if (name === "search_slack") {
          const matches = await searchSlack(
            token,
            channels,
            (input as { keyword: string }).keyword
          );
          for (const m of matches) {
            gatheredMessages.push(m);
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: formatSearchResults(matches, userMap),
          });
        } else if (name === "get_thread") {
          const { channel_id, thread_ts } = input as {
            channel_id: string;
            thread_ts: string;
          };
          const thread = await fetchThreadReplies(token, channel_id, thread_ts);
          const channelName =
            channels.find((c) => c.id === channel_id)?.name || "?";
          const enriched: SlackMessage[] = thread.map((m) => ({
            text: m.text || "",
            user: m.user || "unknown",
            ts: m.ts,
            channelId: channel_id,
            channelName,
          }));
          for (const m of enriched) {
            gatheredMessages.push(m);
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: formatThread(enriched, userMap),
          });
        }
      }
    }

    if (finalSummary) break;
    if (!toolUsed) break; // no tools called, we're done

    // Add tool results for next iteration
    messages.push({ role: "user", content: toolResults });
  }

  return {
    source: "slack",
    summary:
      finalSummary ||
      "Agent completed but did not return a final summary. Raw matches shown below.",
    rawMessages: dedupeMessages(gatheredMessages),
    channelsSearched: channels.length,
    usedAgent: true,
    helpText: `Agent researched ${channels.length} channel${channels.length !== 1 ? "s" : ""} iteratively`,
  };
}

function formatSearchResults(
  messages: SlackMessage[],
  userMap: Record<string, string>
): string {
  if (messages.length === 0) return "No matches found.";
  return messages
    .slice(0, 30)
    .map((m) => {
      const date = new Date(parseFloat(m.ts) * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const user = userMap[m.user] || m.user;
      const threadInfo =
        m.reply_count && m.reply_count > 0
          ? ` [thread: ${m.reply_count} replies, ts=${m.ts}]`
          : m.thread_ts && m.thread_ts !== m.ts
            ? ` [in thread, root_ts=${m.thread_ts}]`
            : "";
      return `[${date}] #${m.channelName} (channel_id=${m.channelId}) ${user}${threadInfo}: ${cleanSlackFormatting(m.text)}`;
    })
    .join("\n");
}

function formatThread(
  messages: SlackMessage[],
  userMap: Record<string, string>
): string {
  return messages
    .map((m) => {
      const date = new Date(parseFloat(m.ts) * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const user = userMap[m.user] || m.user;
      return `[${date}] ${user}: ${cleanSlackFormatting(m.text)}`;
    })
    .join("\n");
}

// -----------------------------------------------------------------------------
// HEURISTIC FALLBACK — no Claude, but smarter than before
// -----------------------------------------------------------------------------

async function runHeuristicResearch(
  query: string,
  token: string,
  channels: SlackChannel[],
  userMap: Record<string, string>
): Promise<ResearchResult> {
  const matches = await searchSlack(token, channels, query);
  if (matches.length === 0) {
    return {
      source: "slack",
      summary: `No Slack messages mentioning "${query}" found in ${channels.length} connected channel${channels.length !== 1 ? "s" : ""}.`,
      rawMessages: [],
      channelsSearched: channels.length,
      usedAgent: false,
      helpText: `Add ANTHROPIC_API_KEY to Vercel env for agent-based smart synthesis.`,
    };
  }

  // For each match, pull its thread (if any)
  const collected: SlackMessage[] = [];
  const threadsFetched = new Set<string>();

  for (const match of matches) {
    collected.push(match);

    // If this message has thread replies OR is in a thread, pull the thread
    const threadTs =
      match.reply_count && match.reply_count > 0 ? match.ts : match.thread_ts;
    if (threadTs && match.channelId && !threadsFetched.has(threadTs)) {
      threadsFetched.add(threadTs);
      try {
        const replies = await fetchThreadReplies(
          token,
          match.channelId,
          threadTs
        );
        for (const r of replies) {
          collected.push({
            text: r.text || "",
            user: r.user || "unknown",
            ts: r.ts,
            channelId: match.channelId,
            channelName: match.channelName,
          });
        }
      } catch {
        // skip thread if can't fetch
      }
    }
  }

  // Dedupe and filter noise
  const cleaned = dedupeMessages(collected)
    .filter((m) => isRelevant(m.text))
    .map((m) => ({ ...m, user: userMap[m.user] || m.user }));

  const summary = formatHeuristicSummary(query, cleaned);

  return {
    source: "slack",
    summary,
    rawMessages: cleaned,
    channelsSearched: channels.length,
    usedAgent: false,
    helpText: `Add ANTHROPIC_API_KEY to Vercel env for smarter agent-based synthesis.`,
  };
}

/**
 * Filters out pure noise: empty messages, pure URLs, system messages, reactions-only.
 */
function isRelevant(text: string): boolean {
  if (!text || !text.trim()) return false;
  const cleaned = text.replace(/<[^>]+>/g, "").trim();
  if (cleaned.length < 3) return false;
  // Skip @-only messages
  if (/^(@\S+\s*)+$/.test(cleaned)) return false;
  return true;
}

function formatHeuristicSummary(query: string, messages: SlackMessage[]): string {
  if (messages.length === 0) {
    return `Found mentions of "${query}" but all messages were filtered as noise (empty/URLs/pings only).`;
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
    msgs.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
    parts.push(`### From #${channelName}`);
    for (const m of msgs) {
      const date = new Date(parseFloat(m.ts) * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      parts.push(`**${date} — ${m.user}:** ${cleanSlackFormatting(m.text)}`);
    }
    parts.push("");
  }
  return parts.join("\n");
}

// -----------------------------------------------------------------------------
// SHARED HELPERS
// -----------------------------------------------------------------------------

async function searchSlack(
  token: string,
  channels: SlackChannel[],
  keyword: string
): Promise<SlackMessage[]> {
  const matches: SlackMessage[] = [];
  const lower = keyword.toLowerCase();

  for (const channel of channels) {
    try {
      const messages = await fetchDeepHistory(token, channel.id, 2000);
      for (const m of messages) {
        if (m.text?.toLowerCase().includes(lower)) {
          matches.push({
            text: m.text,
            user: m.user || "unknown",
            ts: m.ts,
            thread_ts: m.thread_ts,
            reply_count: m.reply_count,
            channelId: channel.id,
            channelName: channel.name,
          });
        }
      }
    } catch (err) {
      console.error(`Search failed in ${channel.name}:`, err);
    }
  }

  matches.sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts));
  return matches;
}

async function listMemberChannels(token: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = [];
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
      throw new Error(`Slack: ${data.error}`);
    }

    for (const c of data.channels || []) {
      if (c.is_member) channels.push({ id: c.id, name: c.name });
    }
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);
  return channels;
}

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

async function fetchThreadReplies(
  token: string,
  channelId: string,
  threadTs: string
): Promise<Array<{ text: string; user: string; ts: string }>> {
  const url = new URL("https://slack.com/api/conversations.replies");
  url.searchParams.set("channel", channelId);
  url.searchParams.set("ts", threadTs);
  url.searchParams.set("limit", "200");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error);
  return data.messages || [];
}

async function resolveUserNames(
  token: string
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
    // silent
  }
  return map;
}

function dedupeMessages(messages: SlackMessage[]): SlackMessage[] {
  const seen = new Set<string>();
  const out: SlackMessage[] = [];
  for (const m of messages) {
    const key = `${m.channelId}-${m.ts}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(m);
    }
  }
  return out;
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
