"use client";

import { useMemo, useState } from "react";
import { Facilitator } from "@/types/facilitator";
import { Check, Copy, ExternalLink, Mail, MessageSquare, X } from "lucide-react";

/**
 * Ask specific people whether they can do specific dates.
 *
 * The first version of this had two problems. It offered "Copy all 3",
 * which glued three personalised notes into one blob that fits no
 * channel — you send these one at a time, to one person, in whatever app
 * you already talk to them in. And it assumed email, when 41 of the 84
 * people had no address on file at all, so for half the bench the panel
 * offered no way to reach anyone.
 *
 * So: one row per person, and every route we can actually offer for
 * them. Email opens a composed draft where there's an address. LinkedIn
 * opens their profile and puts the message on the clipboard, because
 * LinkedIn has no URL that prefills a DM. Copy covers WhatsApp, SMS,
 * Slack, or anything else.
 *
 * The wording matters too. Joe knows these people — several of them for
 * years. A note that opens "you're on the shortlist" and closes "takes a
 * minute" reads like mail-merge from a stranger, and gets answered like
 * one. These read like someone typing quickly to a colleague.
 */

function buildLink(origin: string, f: Facilitator, from: string, to: string, forWhat: string) {
  const q = new URLSearchParams({ name: f.name });
  if (from) q.set("from", from);
  if (to && to !== from) q.set("to", to);
  if (forWhat.trim()) q.set("for", forWhat.trim());
  return `${origin}/availability?${q.toString()}`;
}

function prettyRange(from: string, to: string): string {
  if (!from) return "";
  const d = (iso: string) => new Date(iso + "T00:00:00Z");
  const a = d(from);
  if (Number.isNaN(a.getTime())) return from;
  const long = (x: Date) =>
    x.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  const withYear = (x: Date) =>
    x.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  if (!to || to === from) return withYear(a);
  const b = d(to);
  if (Number.isNaN(b.getTime())) return withYear(a);
  if (a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${a.getUTCDate()}–${withYear(b)}`;
  }
  return `${long(a)} – ${withYear(b)}`;
}

function firstNameOf(name: string) {
  return name.split(/\s+/)[0] || name;
}

/** Long enough for an inbox. */
function emailBody(f: Facilitator, link: string, from: string, to: string, forWhat: string) {
  const when = prettyRange(from, to) || "the dates below";
  const what = forWhat.trim();
  return `${firstNameOf(f.name)} — are you around ${when}?${what ? ` It's for ${what}.` : ""}

Quickest way to tell me is this, your name's already filled in:
${link}

A no is just as useful as a yes, so don't worry about saying it.`;
}

function emailSubject(from: string, to: string, forWhat: string) {
  const when = prettyRange(from, to);
  const what = forWhat.trim();
  if (what && when) return `${what}, ${when} — are you free?`;
  if (when) return `Are you free ${when}?`;
  return "Are you free?";
}

/** Short enough for a DM or a text. */
function shortNote(f: Facilitator, link: string, from: string, to: string, forWhat: string) {
  const when = prettyRange(from, to) || "the dates in here";
  const what = forWhat.trim();
  return `${firstNameOf(f.name)} — any chance you're free ${when}?${
    what ? ` It's a ${what} job.` : ""
  } Quickest way to tell me: ${link} (your name's already in it). A no is fine too.`;
}

function Btn({
  onClick,
  href,
  children,
  primary = false,
}: {
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  const cls = `inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
    primary
      ? "border-arctic-300 bg-arctic-50 text-arctic-800 hover:bg-arctic-100"
      : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
  }`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function PersonRow({
  f,
  link,
  from,
  to,
  forWhat,
}: {
  f: Facilitator;
  link: string;
  from: string;
  to: string;
  forWhat: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const note = shortNote(f, link, from, to, forWhat);
  const body = emailBody(f, link, from, to, forWhat);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard blocked — the note is on screen to select by hand */
    }
  };

  const mailto = f.email
    ? `mailto:${f.email}?subject=${encodeURIComponent(
        emailSubject(from, to, forWhat)
      )}&body=${encodeURIComponent(body)}`
    : null;
  const linkedin = f.linkedinUrl?.startsWith("http") ? f.linkedinUrl : null;

  return (
    <li className="rounded-lg border border-ink-200 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink-900">{f.name}</p>
          <p className="truncate text-xs text-ink-500">
            {f.email || (linkedin ? "LinkedIn only — no email on file" : "no contact details on file")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {mailto && (
            <Btn href={mailto} primary>
              <Mail className="h-3.5 w-3.5" />
              Email
            </Btn>
          )}
          {linkedin && (
            // LinkedIn has no URL that prefills a DM, so put the note on
            // the clipboard as the profile opens — one paste away.
            <Btn href={linkedin} onClick={() => copy(note, "li")}>
              <ExternalLink className="h-3.5 w-3.5" />
              {copied === "li" ? "Copied, opening" : "LinkedIn"}
            </Btn>
          )}
          <Btn onClick={() => copy(note, "msg")}>
            {copied === "msg" ? (
              <Check className="h-3.5 w-3.5 text-ok-600" />
            ) : (
              <MessageSquare className="h-3.5 w-3.5" />
            )}
            {copied === "msg" ? "Copied" : "Copy note"}
          </Btn>
          <Btn onClick={() => copy(link, "link")}>
            {copied === "link" ? (
              <Check className="h-3.5 w-3.5 text-ok-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied === "link" ? "Copied" : "Link"}
          </Btn>
        </div>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-600">
        {note}
      </p>
    </li>
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
    () => people.map((f) => ({ f, link: buildLink(origin, f, from, to, forWhat) })),
    [people, origin, from, to, forWhat]
  );

  const noRoute = rows.filter(
    ({ f }) => !f.email && !f.linkedinUrl?.startsWith("http")
  ).length;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink-950/40 p-4 backdrop-blur-sm sm:p-8">
      <div className="w-full max-w-2xl rounded-xl border border-ink-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-900">
              Ask {people.length} {people.length === 1 ? "person" : "people"} about dates
            </h2>
            <p className="mt-0.5 text-sm text-ink-500">
              One at a time, through whatever you normally use. Each link
              carries their name as the sheet spells it, so the answer lands
              on their row.
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
              Pick a first day. Without one these are the same generic ask
              that nobody has answered yet.
            </p>
          )}

          {noRoute > 0 && (
            <p className="text-xs text-ink-500">
              {noRoute} of these {noRoute === 1 ? "has" : "have"} no email and
              no LinkedIn on file — copy the note and send it however you
              normally reach them.
            </p>
          )}

          <ul className="max-h-[46vh] space-y-2 overflow-y-auto">
            {rows.map(({ f, link }) => (
              <PersonRow
                key={f.id}
                f={f}
                link={link}
                from={from}
                to={to}
                forWhat={forWhat}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
