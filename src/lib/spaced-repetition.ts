/**
 * SM-2 scheduling. Pure arithmetic over a card's current state — no database
 * and no environment, so the intervals can be checked directly rather than
 * inferred from what the review queue happens to show.
 */

export const REVIEW_GRADES = ["again", "hard", "good", "easy"] as const;
export type ReviewGrade = (typeof REVIEW_GRADES)[number];

/** SM-2 is defined over a 0–5 quality score; these are the four a UI can
 *  meaningfully ask a person to distinguish. */
const QUALITY: Record<ReviewGrade, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

const MIN_EASE = 1.3;
/** Two years. A card answered "easy" forever would otherwise drift to an
 *  interval no longer expressible as a sensible date. */
const MAX_INTERVAL_DAYS = 730;

export type CardState = {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
};

export type NextReview = CardState & { dueAt: Date };

export function scheduleReview(
  state: CardState,
  grade: ReviewGrade,
  now: Date = new Date(),
): NextReview {
  const quality = QUALITY[grade];

  // Anything below "good" restarts the ladder: the card is not known, and
  // stretching its interval because it was *nearly* known is how leeches form.
  const failed = quality < 3;

  const repetitions = failed ? 0 : state.repetitions + 1;

  const easeFactor = Math.max(
    MIN_EASE,
    state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  );

  let intervalDays: number;
  if (failed) {
    intervalDays = 0; // due again in this same session
  } else if (repetitions === 1) {
    intervalDays = 1;
  } else if (repetitions === 2) {
    intervalDays = 6;
  } else {
    intervalDays = Math.round(state.intervalDays * easeFactor);
  }
  intervalDays = Math.min(intervalDays, MAX_INTERVAL_DAYS);

  const dueAt = new Date(now);
  if (intervalDays === 0) {
    // Ten minutes, not "now": a lapsed card should come back later in the
    // session rather than immediately repeating the answer just shown.
    dueAt.setMinutes(dueAt.getMinutes() + 10);
  } else {
    dueAt.setDate(dueAt.getDate() + intervalDays);
    // Due at the start of that day, so a card scheduled at 23:00 is not
    // effectively lost for the whole of its due date.
    dueAt.setHours(0, 0, 0, 0);
  }

  return { easeFactor, intervalDays, repetitions, dueAt };
}
