"use client";

import { ProposalOutput, ProposalSection } from "@/types/proposal";

export default function ProposalPreview({
  proposal,
}: {
  proposal: ProposalOutput;
}) {
  return (
    <div
      id="proposal-doc"
      className="bg-white rounded-xl shadow-lg border border-gray-200 p-10 md:p-14 max-w-4xl mx-auto print:shadow-none print:border-0 print:p-0"
    >
      {/* Header */}
      <div className="border-b-2 border-indigo-600 pb-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <img
            src="/logo.avif"
            alt="ArcticBlue"
            className="h-10 w-auto"
          />
          <span className="text-xs text-gray-400 uppercase tracking-widest">
            AI Training & Advisory
          </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight">
          {proposal.title}
        </h1>
        <p className="text-lg text-gray-500 mt-2">{proposal.subtitle}</p>
      </div>

      {/* Sections */}
      <div className="space-y-8">
        {proposal.sections.map((section, i) => (
          <SectionView key={i} section={section} />
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 mt-12 pt-6 text-center text-xs text-gray-400">
        ArcticBlue AI · arcticblue.ai · Confidential
      </div>
    </div>
  );
}

function SectionView({ section }: { section: ProposalSection }) {
  const HeadingTag = section.level === 2 ? "h2" : section.level === 3 ? "h3" : "h1";
  const headingClass =
    section.level === 2
      ? "text-2xl font-bold text-gray-900 mt-8 mb-3 pb-2 border-b border-gray-100"
      : section.level === 3
        ? "text-lg font-semibold text-gray-800 mt-5 mb-2"
        : "text-3xl font-bold text-gray-900 mb-4";

  return (
    <section>
      {section.heading && (
        <HeadingTag className={headingClass}>{section.heading}</HeadingTag>
      )}

      {section.content.map((para, i) => (
        <p
          key={i}
          className="text-gray-700 leading-relaxed mb-3"
          dangerouslySetInnerHTML={{ __html: renderInlineFormatting(para) }}
        />
      ))}

      {section.bullets && (
        <ul className="list-disc pl-6 space-y-1.5 mb-4">
          {section.bullets.map((b, i) => (
            <li
              key={i}
              className="text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderInlineFormatting(b) }}
            />
          ))}
        </ul>
      )}

      {section.table && (
        <div className="overflow-x-auto my-4">
          <table className="w-full border-collapse border border-gray-200 text-sm">
            <thead>
              <tr className="bg-indigo-50">
                {section.table.headers.map((h, i) => (
                  <th
                    key={i}
                    className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-800"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-gray-50">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border border-gray-200 px-3 py-2 text-gray-700 align-top"
                      dangerouslySetInnerHTML={{
                        __html: renderInlineFormatting(cell),
                      }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section.subsections?.map((sub, i) => (
        <SectionView key={i} section={sub} />
      ))}
    </section>
  );
}

function renderInlineFormatting(text: string): string {
  // Bold markdown
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br/>");
}
