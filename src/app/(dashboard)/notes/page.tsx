import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { searchNotes } from "@/services/note-service";
import { listNotes, listTags } from "@/repositories/note-repository";

export const metadata = { title: "Notes · Nexus" };

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default async function NotesPage({
  searchParams,
}: PageProps<"/notes">) {
  const userId = await requireUserId();
  const params = await searchParams;

  const query = typeof params.q === "string" ? params.q : "";
  const tag = typeof params.tag === "string" ? params.tag : "";
  const favoritesOnly = params.favorites === "1";

  const [result, tags] = await Promise.all([
    query
      ? searchNotes(userId, query)
      : listNotes(userId, { favoritesOnly, tag: tag || undefined }).then(
          (notes) => ({ mode: "semantic" as const, notes }),
        ),
    listTags(userId),
  ]);

  const { notes, mode } = result;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">Notes</h1>
          <p className="mt-1 text-sm text-text-muted">
            {notes.length} {notes.length === 1 ? "note" : "notes"}
            {query && mode === "semantic" && " · ranked by meaning"}
            {query && mode === "keyword" && " · keyword match (model offline)"}
          </p>
        </div>
        <Link
          href="/notes/new"
          className="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          New note
        </Link>
      </header>

      <form className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Search your notes by meaning…"
          aria-label="Search notes"
          className="flex-1 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg border border-border-subtle bg-surface px-3.5 py-2 text-sm text-text transition-colors hover:bg-surface-raised"
        >
          Search
        </button>
      </form>

      {!query && (tags.length > 0 || favoritesOnly) && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Link
            href="/notes"
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              !tag && !favoritesOnly
                ? "border-accent bg-accent-soft text-accent"
                : "border-border-subtle text-text-muted hover:bg-surface-raised"
            }`}
          >
            All
          </Link>
          <Link
            href="/notes?favorites=1"
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              favoritesOnly
                ? "border-accent bg-accent-soft text-accent"
                : "border-border-subtle text-text-muted hover:bg-surface-raised"
            }`}
          >
            Favorites
          </Link>
          {tags.map((name: string) => (
            <Link
              key={name}
              href={`/notes?tag=${encodeURIComponent(name)}`}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                tag === name
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border-subtle text-text-muted hover:bg-surface-raised"
              }`}
            >
              {name}
            </Link>
          ))}
        </div>
      )}

      {notes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-10 text-center text-sm text-text-muted">
          {query
            ? `Nothing matched “${query}”.`
            : "No notes yet. Create your first one."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/notes/${note.id}`}
                className="block rounded-xl border border-border-subtle bg-surface p-4 transition-colors hover:border-border-strong"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="truncate font-medium text-text">
                    {note.isFavorite && (
                      <span className="mr-1.5 text-accent" aria-label="Favorite">
                        ★
                      </span>
                    )}
                    {note.title}
                  </h2>
                  <span className="shrink-0 text-xs text-text-faint">
                    {formatDate(note.updatedAt)}
                  </span>
                </div>
                {note.excerpt && (
                  <p className="mt-1 line-clamp-2 text-sm text-text-muted">
                    {note.excerpt}
                  </p>
                )}
                {note.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {note.tags.map((name) => (
                      <span
                        key={name}
                        className="rounded-full bg-surface-raised px-2 py-0.5 text-xs text-text-muted"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
