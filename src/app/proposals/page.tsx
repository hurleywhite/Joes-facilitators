"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, FileText, Copy, Check } from "lucide-react";
import { ProposalInput, ProposalOutput } from "@/types/proposal";
import ProposalChat from "@/components/proposal/ProposalChat";
import ProposalPreview from "@/components/proposal/ProposalPreview";

export default function ProposalsPage() {
  const [proposal, setProposal] = useState<ProposalOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (input: ProposalInput, enhance: boolean) => {
    setError(null);
    try {
      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, enhance }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setProposal(data.proposal);
      // Scroll to preview
      setTimeout(() => {
        document.getElementById("proposal-doc")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate proposal");
    }
  };

  const handlePrint = () => window.print();

  const handleCopyHTML = async () => {
    const el = document.getElementById("proposal-doc");
    if (!el) return;
    const html = el.outerHTML;
    await navigator.clipboard.writeText(html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-gray-500 hover:text-gray-700"
              title="Back to Facilitator Pool"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <img src="/logo.avif" alt="ArcticMind" className="h-10 w-auto" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Proposal Generator
              </h1>
              <p className="text-xs text-gray-500">
                Client-ready AI training proposals in ArcticBlue format
              </p>
            </div>
          </div>
          {proposal && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyHTML}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-green-600" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" /> Copy HTML
                  </>
                )}
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <Printer className="w-4 h-4" /> Print / Save PDF
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8 print:p-0">
        {/* Intro */}
        {!proposal && (
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-6 print:hidden">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Build a client-ready AI training proposal
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Fill in the details below or start with a quick-fill template. The generator
              produces a polished proposal in the standard ArcticBlue format —
              ready to print, save as PDF, or copy into Google Docs.
            </p>
          </div>
        )}

        {/* Chat / Form */}
        <div className="print:hidden">
          <ProposalChat onGenerate={handleGenerate} />
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm print:hidden">
            {error}
          </div>
        )}

        {/* Preview */}
        {proposal && (
          <div className="print:m-0">
            <div className="mb-4 print:hidden">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                Preview
              </h3>
            </div>
            <ProposalPreview proposal={proposal} />
          </div>
        )}
      </div>
    </main>
  );
}
