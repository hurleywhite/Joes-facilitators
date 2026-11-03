"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Check, Link2 } from "lucide-react";

/**
 * The one header every page uses.
 *
 * Before this existed each page invented its own — which is how the app
 * ended up with six nav buttons in six different pastel colours. Nav here
 * is plain text; the current page is marked with weight and a rule, not a
 * colour. Exactly one element on the page is allowed to be solid arctic
 * blue, and it's the primary action.
 */

/** Views you read. */
const VIEWS = [
  { href: "/", label: "Roster" },
  { href: "/engagements", label: "Engagements" },
  { href: "/chat", label: "Ask" },
];

/** Routes that write back to the sheet. Grouped because they're one job —
 *  getting unstructured text into structured rows — via three doors. */
const CAPTURE = [
  { href: "/edit", label: "Notes" },
  { href: "/transcripts", label: "Transcripts" },
  { href: "/emails", label: "Email" },
];

function NavLink({
  href,
  label,
  active,
  muted = false,
}: {
  href: string;
  label: string;
  active: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative py-1 text-sm transition-colors ${
        active
          ? "font-semibold text-ink-900"
          : muted
            ? "text-ink-500 hover:text-ink-800"
            : "text-ink-600 hover:text-ink-900"
      }`}
    >
      {label}
      {/* Underline sits under the word, not under the header. The previous
          offset was tuned to one specific header height and broke the
          moment the nav wrapped onto its own row on a phone. */}
      {active && (
        <span className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-arctic-500" />
      )}
    </Link>
  );
}

export default function AppHeader({
  /** Short line of live state under the wordmark, e.g. "20 facilitators · 7 countries". */
  status,
  /** Page-specific controls (Refresh, etc.) rendered before the primary action. */
  children,
}: {
  status?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const shareForm = async () => {
    const url = `${window.location.origin}/availability`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-ink-200 bg-white/95 backdrop-blur-sm">
      {/* On a laptop this is one row. On a phone it was three — logo, then
          two nav rows, then the buttons — which ate half the first screen.
          Ordering puts the actions back up beside the logo and drops the
          nav underneath as a single full-width row. */}
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2.5 px-4 py-2.5 sm:px-6 lg:py-3">
        {/* Identity */}
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.avif" alt="" className="h-7 w-auto" />
          <span className="flex flex-col leading-tight">
            <span className="text-[15px] font-semibold tracking-tight text-ink-900">
              Facilitator Pool
            </span>
            {status && (
              <span className="tnum text-[11px] text-ink-500">{status}</span>
            )}
          </span>
        </Link>

        <div className="order-3 flex w-full items-center gap-x-5 gap-y-2 overflow-x-auto lg:order-none lg:w-auto">
          {/* Views */}
          <nav className="flex shrink-0 items-center gap-5">
            {VIEWS.map((v) => (
              <NavLink key={v.href} {...v} active={isActive(v.href)} />
            ))}
          </nav>

          <span className="h-4 w-px shrink-0 bg-ink-200" />

          {/* Capture routes — same job, three doors. Muted because you come
              here on purpose, not while browsing. */}
          <nav className="flex shrink-0 items-center gap-4">
            <span className="eyebrow hidden lg:inline">Log</span>
            {CAPTURE.map((c) => (
              <NavLink key={c.href} {...c} active={isActive(c.href)} muted />
            ))}
          </nav>
        </div>

        <div className="order-2 ml-auto flex items-center gap-2 lg:order-none">
          {children}
          <button
            type="button"
            onClick={shareForm}
            title="Copy the link facilitators use to tell us when they're free"
            className="inline-flex items-center gap-1.5 rounded-md bg-arctic-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-arctic-700"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Copied
              </>
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5" />
                Availability form
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

/** Secondary button, used for page-level controls slotted into the header. */
export function HeaderButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
