"use client";

import { useMemo, useState } from "react";
import { Facilitator } from "@/types/facilitator";
import { Check, Copy, Mail, X } from "lucide-react";

/**
 * Ask a specific set of people about a specific set of dates.
 *
 * The availability form has existed for months and not one of the 84
 * people on the bench has filled it in. That isn't a form problem — it's
 * that the only way to send it was a single generic link that asks you to
 * describe your whole year to nobody in particular, with no deadline and
 * no reason attached.
 *
 * This produces the other kind of ask: these dates, this client, your
 * name already in the field. Each link carries the person's name exactly
 * as the Speaking Directory spells it, which also closes the silent
 * failure where a typed name never joins back to their row.
 *
 * It deliberately stops at the clipboard. Sending mail on someone's
 * behalf needs a mail integration, a from-address and a deliverability
 * story; copy-and-paste into the channel Joe already uses needs none of
 * that and works today.
 */

function buildLink(origin: string, f: Facilitator, from: string, to: string, forWhat: string) {
  const q = new URLSearchParams({ name: f.name });
  if (from) q.set("from", from);
  if (to && to !== from) q.set("to", to);
  if (forWhat.trim()) q.set("for", forWhat.trim());
  return `${origin}/availability?${q.toString()}`;
}

function prettyRange(from: string, to: string): string {
  if (!from) return "the dates below";
  const d = (iso: string) => new Date(iso + "T00:00:00Z");
  const a = d(from);
  if (Number.isNaN(a.getTime())) return from;
  const long = (x: Date) =>
    x.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  if (!to || to === from) return long(a);
  const b = d(to);
  if (Number.isNaN(b.getTime())) return long(a);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${a.getUTCDate()}–${long(b)}`;
  }
  return `${long(a)} – ${long(b)}`;
}

function buildMessage(f: Facilitator, link: string, from: string, to: string, forWhat: string) {
  const firstName = f.name.split(/\s+/)[0] || f.name;
  const client = forWhat.trim();
  const opener = client
    ? `We're scoping ${client} for ${prettyRange(from, to)}`
    : `We've got something coming up on ${prettyRange(from, to)}`;
  return `Hi ${firstName},

${opener} and you're on the shortlist.

Can you do it? This link already has your name on it, so it takes a minute:
${link}

If those dates don't work, say so in the notes — knowing you're out helps us just as much.`;
}

function CopyButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch {
          /* clipboard blocked — the text is on screen to select by hand */
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-50 ${className}`}
    >
      {done ? <Check className="h-3.5 w-3.5 text-ok-600" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

export default function AskForDates({
  people,
  onClose,
}: {
  people: Facilitator[];
  onClose: () => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [forWhat, setForWhat] = useState("");

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const rows = useMemo(
    () =>
      people.map((f) => {
        const link = buildLink(origin, f, from, to, forWhat);
        return { f, link, message: buildMessage(f, link, from, to, forWhat) };
      }),
    [people, origin, from, to, forWhat]
  );

  const allMessages = rows.map((r) => r.message).join("\n\n———\n\n");
  const withEmail = rows.filter((r) => r.f.email);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 backdrop-blur-sm sm:p-8">
      <div className="w-full max-w-2xl rounded-xl border border-ink-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-900">
              Ask {people.length} {people.length === 1 ? "person" : "people"} about dates
            </h2>
            <p className="mt-0.5 text-sm text-ink-500">
              Each link carries their name exactly as the sheet spells it, so
              the answer lands on their row.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="eyebrow">First day</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="tnum mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="eyebrow">Last day</span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="tnum mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="eyebrow">What for</span>
              <input
                type="text"
                value={forWhat}
                onChange={(e) => setForWhat(e.target.value)}
                placeholder="Tamkeen"
                className="mt-1 w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-sm"
              />
            </label>
          </div>

          {!from && (
            <p className="rounded-md border border-warn-200 bg-warn-50 px-3 py-2 text-xs text-warn-700">
              Pick at least a first day. A link with no dates on it is the
              generic ask that nobody has answered yet.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
            <CopyButton
              text={allMessages}
              label={`Copy all ${rows.length}`}
              className="border-arctic-300 bg-arctic-50 text-arctic-800 hover:bg-arctic-100"
            />
            {withEmail.length > 0 && (
              <a
                href={`mailto:${withEmail.map((r) => r.f.email).join(",")}?subject=${encodeURIComponent(
                  forWhat.trim() ? `${forWhat.trim()} — are you free?` : "Are you free?"
                )}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-50"
              >
                <Mail className="h-3.5 w-3.5" />
                Open mail to {withEmail.length} with addresses
              </a>
            )}
            <span className="tnum text-xs text-ink-500">
              {rows.length - withEmail.length > 0 &&
                `${rows.length - withEmail.length} have no email on file`}
            </span>
          </div>

          <ul className="max-h-[42vh] space-y-2 overflow-y-auto">
            {rows.map(({ f, link, message }) => (
              <li key={f.id} className="rounded-lg border border-ink-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{f.name}</p>
                    <p className="truncate text-xs text-ink-500">
                      {f.email || f.location || "no email on file"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <CopyButton text={link} label="Link" />
                    <CopyButton text={message} label="Message" />
                  </div>
                </div>
                <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-ink-600">
                  {message}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
