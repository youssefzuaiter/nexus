import Link from "next/link";
import { PdfImportForm } from "@/components/pdf-import-form";

export const metadata = { title: "Import PDF · Nexus" };

export default function ImportPdfPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5">
        <Link
          href="/notes"
          className="text-sm text-text-muted transition-colors hover:text-text"
        >
          ← Notes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text">
          Import a PDF
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Extracts the text and saves it as a regular note — searchable,
          citable by the assistant, and taggable like anything else. Works
          best on text-based PDFs; a scanned photo of a page has no text to
          extract.
        </p>
      </header>

      <PdfImportForm />
    </div>
  );
}
