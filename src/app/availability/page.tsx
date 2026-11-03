import AvailabilityForm from "@/components/AvailabilityForm";

/**
 * Server component so the form arrives as HTML.
 *
 * The prefill params are read here and handed down as props. Reading
 * them in the client component with useSearchParams instead forces the
 * surrounding Suspense boundary to be client-only, which served this
 * route as a blank shell — the entire form appeared only once JS had
 * run. This is a public page that facilitators open from a link, often
 * on a phone, so it renders server-side.
 */
type Search = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] ?? "" : v ?? "").trim();

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  return (
    <AvailabilityForm
      askedName={one(sp.name)}
      askedFrom={one(sp.from)}
      askedTo={one(sp.to)}
      askedFor={one(sp.for)}
    />
  );
}
