import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/session";
import {
  getCourse,
  listCourseContents,
} from "@/repositories/course-repository";
import { GradePanel } from "@/components/grade-panel";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteCourseAction } from "@/actions/courses";

export const metadata = { title: "Course · Nexus" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

const DATETIME = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function CoursePage({
  params,
}: PageProps<"/courses/[id]">) {
  const userId = await requireUserId();
  const { id } = await params;

  const course = await getCourse(userId, id);
  if (!course) notFound();

  const contents = await listCourseContents(userId, course.id);
  const deleteThisCourse = deleteCourseAction.bind(null, course.id);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5">
        <Link
          href="/courses"
          className="text-sm text-text-muted transition-colors hover:text-text"
        >
          ← Courses
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text">
          <span className="font-mono text-xl text-accent">{course.code}</span>{" "}
          {course.title}
        </h1>
        <p className="mt-1 text-sm text-text-muted">{course.term}</p>
      </header>

      <GradePanel
        courseId={course.id}
        assessments={course.assessments.map((row) => ({
          id: row.id,
          title: row.title,
          weight: row.weight,
          score: row.score,
          maxScore: row.maxScore,
          dueDate: row.dueDate ? DATE.format(row.dueDate) : null,
        }))}
      />

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">
          Next classes · {contents.events.length}
        </h2>
        {contents.events.length === 0 ? (
          <p className="text-sm text-text-muted">
            No upcoming events linked. Import your timetable, then use “Claim
            matching timetable events” above.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {contents.events.map((event) => (
              <li
                key={event.id}
                className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-2.5"
              >
                <Link
                  href={`/calendar/${event.id}`}
                  className="min-w-0 flex-1 truncate text-sm text-text transition-colors hover:text-accent"
                >
                  {event.title}
                </Link>
                <span className="shrink-0 text-xs text-text-muted">
                  {DATETIME.format(event.startTime)}
                  {event.location ? ` · ${event.location}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">
          Tasks · {contents.tasks.length}
        </h2>
        {contents.tasks.length === 0 ? (
          <p className="text-sm text-text-muted">No tasks for this course.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {contents.tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-2.5"
              >
                <Link
                  href={`/tasks/${task.id}`}
                  className={`min-w-0 flex-1 truncate text-sm transition-colors hover:text-accent ${
                    task.status === "done"
                      ? "text-text-faint line-through"
                      : "text-text"
                  }`}
                >
                  {task.title}
                </Link>
                {task.dueDate && (
                  <span className="shrink-0 text-xs text-text-muted">
                    {DATE.format(task.dueDate)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-faint">
          Notes · {contents.notes.length}
        </h2>
        {contents.notes.length === 0 ? (
          <p className="text-sm text-text-muted">No notes for this course.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {contents.notes.map((note) => (
              <li
                key={note.id}
                className="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-2.5"
              >
                <Link
                  href={`/notes/${note.id}`}
                  className="min-w-0 flex-1 truncate text-sm text-text transition-colors hover:text-accent"
                >
                  {note.title}
                </Link>
                <span className="shrink-0 text-xs text-text-muted">
                  {DATE.format(note.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 border-t border-border-subtle pt-4">
        <ConfirmDeleteButton
          action={deleteThisCourse}
          label="Delete course"
          confirmText="Delete this course? Its notes, tasks and events are kept and simply detached."
        />
      </div>
    </div>
  );
}
