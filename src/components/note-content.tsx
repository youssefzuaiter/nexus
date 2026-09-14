"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { wikiLinkPattern, normalizeTitle } from "@/lib/wiki-links";

/**
 * Renders note text as Markdown for reading.
 *
 * react-markdown builds React elements rather than setting innerHTML, and no
 * raw-HTML plugin is enabled, so a note containing `<script>` renders as the
 * literal characters. That matters here: note content is not always typed by
 * the author — an imported PDF is whatever the file contained.
 */

/**
 * `[[Title]]` is this app's own syntax, not Markdown's, so it is substituted
 * into the already-parsed text nodes rather than handed to the parser. Working
 * on text nodes is what keeps a `[[link]]` inside a code fence from turning
 * into a link.
 */
function withWikiLinks(text: string, links: Map<string, string | null>): ReactNode {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  const pattern = wikiLinkPattern();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    const title = match[1].trim();
    const id = links.get(normalizeTitle(title)) ?? null;

    parts.push(
      id ? (
        <Link
          key={`w${key++}`}
          href={`/notes/${id}`}
          className="text-accent hover:underline"
        >
          {title}
        </Link>
      ) : (
        <span
          key={`w${key++}`}
          title="No note with this title yet"
          className="text-text-muted underline decoration-dotted"
        >
          {title}
        </span>
      ),
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex === 0) return text;
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}

function linkifyChildren(
  children: ReactNode,
  links: Map<string, string | null>,
): ReactNode {
  if (typeof children === "string") return withWikiLinks(children, links);
  if (Array.isArray(children)) {
    return children.map((child, index) => (
      <Fragment key={index}>{linkifyChildren(child, links)}</Fragment>
    ));
  }
  return children;
}

export function NoteContent({
  content,
  links,
}: {
  content: string;
  /** Normalized note title → its id, or null when nothing resolves. */
  links: Record<string, string | null>;
}) {
  const map = new Map(Object.entries(links));
  const linkify = (children: ReactNode) => linkifyChildren(children, map);

  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-text">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h2 className="mt-2 font-serif text-xl font-bold text-text">
              {linkify(children)}
            </h2>
          ),
          h2: ({ children }) => (
            <h3 className="mt-2 font-serif text-lg font-bold text-text">
              {linkify(children)}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-2 font-medium text-text">{linkify(children)}</h4>
          ),
          p: ({ children }) => <p>{linkify(children)}</p>,
          li: ({ children }) => <li>{linkify(children)}</li>,
          ul: ({ children }) => (
            <ul className="list-disc pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5">{children}</ol>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border-strong pl-3 text-text-muted">
              {children}
            </blockquote>
          ),
          code: ({ className, children }) => {
            // A fenced block gets a language class; an inline span does not.
            const fenced = Boolean(className);
            return fenced ? (
              <code className="block overflow-x-auto rounded-lg bg-surface-raised p-3 font-mono text-xs">
                {children}
              </code>
            ) : (
              <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-xs">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border-strong px-2 py-1 font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border-subtle px-2 py-1">
              {children}
            </td>
          ),
          hr: () => <hr className="border-border-subtle" />,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
