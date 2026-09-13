// Pure focus-session maths. No model, no database.

export const COGNITIVE_LOADS = ["light", "steady", "deep"] as const;
export type CognitiveLoad = (typeof COGNITIVE_LOADS)[number];

export const MIN_SESSION_SECONDS = 30;
export const MAX_SESSION_SECONDS = 4 * 60 * 60;

/**
 * A coarse label for how a writing session went, derived from how long it ran
 * and how fast text was entered.
 *
 * This is a rough heuristic over two crude signals, not a measure of anything
 * cognitive. It is deliberately named and presented as an observation about the
 * session rather than a claim about the person, and nothing in the app makes
 * decisions from it.
 */
export function classifyLoad(
  sessionSeconds: number,
  typingSpeedWpm: number,
): CognitiveLoad {
  if (sessionSeconds >= 20 * 60 && typingSpeedWpm >= 25) return "deep";
  if (sessionSeconds >= 5 * 60 || typingSpeedWpm >= 35) return "steady";
  return "light";
}

/** Words per minute over the active writing time, using the usual 5-char word. */
export function wordsPerMinute(
  charactersTyped: number,
  activeSeconds: number,
): number {
  if (activeSeconds <= 0 || charactersTyped <= 0) return 0;
  return Math.round(charactersTyped / 5 / (activeSeconds / 60));
}

export type FocusSummary = {
  sessions: number;
  totalMinutes: number;
  averageWpm: number;
  longestMinutes: number;
  byLoad: Record<CognitiveLoad, number>;
};

export function summarise(
  sessions: { sessionDuration: number; typingSpeedWpm: number; cognitiveLoad: string }[],
): FocusSummary {
  const empty: FocusSummary = {
    sessions: 0,
    totalMinutes: 0,
    averageWpm: 0,
    longestMinutes: 0,
    byLoad: { light: 0, steady: 0, deep: 0 },
  };

  if (sessions.length === 0) return empty;

  const totalSeconds = sessions.reduce((sum, s) => sum + s.sessionDuration, 0);
  const longest = Math.max(...sessions.map((s) => s.sessionDuration));

  // Weight each session's speed by its length, so a ten-second burst does not
  // count as much as an hour of steady writing.
  const weighted = sessions.reduce(
    (sum, s) => sum + s.typingSpeedWpm * s.sessionDuration,
    0,
  );

  const byLoad = { ...empty.byLoad };
  for (const session of sessions) {
    if (session.cognitiveLoad in byLoad) {
      byLoad[session.cognitiveLoad as CognitiveLoad] += 1;
    }
  }

  return {
    sessions: sessions.length,
    totalMinutes: Math.round(totalSeconds / 60),
    averageWpm: totalSeconds > 0 ? Math.round(weighted / totalSeconds) : 0,
    longestMinutes: Math.round(longest / 60),
    byLoad,
  };
}
