import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIcs } from "@/lib/ics";

function feed(...lines: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR"].join("\r\n");
}

function vevent(...lines: string[]): string {
  return feed("BEGIN:VEVENT", ...lines, "END:VEVENT");
}

test("a UTC event keeps its instant", () => {
  const [event] = parseIcs(
    vevent(
      "UID:a@x",
      "DTSTART:20261020T113000Z",
      "DTEND:20261020T133000Z",
      "SUMMARY:AI Midterm",
    ),
  );
  assert.equal(event.start.toISOString(), "2026-10-20T11:30:00.000Z");
  assert.equal(event.end.toISOString(), "2026-10-20T13:30:00.000Z");
});

test("a TZID is converted to the right instant", () => {
  const [event] = parseIcs(
    vevent(
      "UID:b@x",
      "DTSTART;TZID=Europe/Istanbul:20260915T090000",
      "DTEND;TZID=Europe/Istanbul:20260915T110000",
      "SUMMARY:Lecture",
    ),
  );
  // Istanbul is UTC+3 year round.
  assert.equal(event.start.toISOString(), "2026-09-15T06:00:00.000Z");
});

test("a weekly BYDAY rule produces every named weekday", () => {
  const events = parseIcs(
    vevent(
      "UID:c@x",
      "DTSTART;TZID=Europe/Istanbul:20260915T090000",
      "DTEND;TZID=Europe/Istanbul:20260915T110000",
      "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261015T000000Z",
      "SUMMARY:CMP2003",
    ),
  );

  const weekdays = new Set(events.map((event) => event.start.getDay()));
  assert.deepEqual([...weekdays].sort(), [2, 4], "Tuesdays and Thursdays only");
  assert.ok(events.length > 4, "the series spans several weeks");
});

test("UNTIL ends the series", () => {
  const events = parseIcs(
    vevent(
      "UID:d@x",
      "DTSTART:20260901T090000Z",
      "DTEND:20260901T100000Z",
      "RRULE:FREQ=WEEKLY;UNTIL=20260922T000000Z",
      "SUMMARY:Weekly",
    ),
  );
  assert.equal(events.length, 3);
  for (const event of events) {
    assert.ok(event.start <= new Date("2026-09-22T00:00:00Z"));
  }
});

test("COUNT limits the series", () => {
  const events = parseIcs(
    vevent(
      "UID:e@x",
      "DTSTART:20260901T090000Z",
      "RRULE:FREQ=DAILY;COUNT=4",
      "SUMMARY:Daily",
    ),
  );
  assert.equal(events.length, 4);
});

test("an EXDATE removes that occurrence", () => {
  const withExclusion = parseIcs(
    vevent(
      "UID:f@x",
      "DTSTART:20260901T090000Z",
      "RRULE:FREQ=DAILY;COUNT=3",
      "EXDATE:20260902T090000Z",
      "SUMMARY:Daily",
    ),
  );
  assert.equal(withExclusion.length, 2);
  assert.ok(
    !withExclusion.some((event) => event.start.getUTCDate() === 2),
    "the excluded day is gone",
  );
});

test("a folded line is rejoined into the original value", () => {
  // RFC 5545 folds by inserting CRLF plus one whitespace character, and
  // unfolding removes both — so an exporter puts the real space before the
  // break, as here.
  const [event] = parseIcs(
    vevent(
      "UID:g@x",
      "DTSTART:20260901T090000Z",
      "SUMMARY:Data Structures and ",
      " Algorithms",
    ),
  );
  assert.equal(event.title, "Data Structures and Algorithms");
});

test("the whitespace introduced by folding is not kept as content", () => {
  const [event] = parseIcs(
    vevent(
      "UID:g2@x",
      "DTSTART:20260901T090000Z",
      "SUMMARY:Micro",
      "\tbiology",
    ),
  );
  assert.equal(event.title, "Microbiology");
});

test("escaped commas and newlines are unescaped", () => {
  const [event] = parseIcs(
    vevent(
      "UID:h@x",
      "DTSTART:20260901T090000Z",
      "SUMMARY:Exam",
      "LOCATION:Hall C\\, North Campus",
      "DESCRIPTION:Line one\\nLine two",
    ),
  );
  assert.equal(event.location, "Hall C, North Campus");
  assert.equal(event.description, "Line one\nLine two");
});

test("a DATE-only event covers the whole day", () => {
  const [event] = parseIcs(
    vevent("UID:i@x", "DTSTART;VALUE=DATE:20261029", "SUMMARY:Republic Day"),
  );
  const hours = (event.end.getTime() - event.start.getTime()) / 3_600_000;
  assert.equal(hours, 24);
  assert.equal(event.start.getHours(), 0);
});

test("a timed event with no DTEND defaults to an hour, not zero length", () => {
  const [event] = parseIcs(
    vevent("UID:j@x", "DTSTART:20260901T090000Z", "SUMMARY:Open ended"),
  );
  assert.equal((event.end.getTime() - event.start.getTime()) / 60000, 60);
});

test("recurring instances get distinct uids so a re-sync can address each", () => {
  const events = parseIcs(
    vevent(
      "UID:k@x",
      "DTSTART:20260901T090000Z",
      "RRULE:FREQ=DAILY;COUNT=3",
      "SUMMARY:Daily",
    ),
  );
  assert.equal(new Set(events.map((event) => event.uid)).size, 3);
});

test("a single event keeps its bare uid", () => {
  const [event] = parseIcs(
    vevent("UID:solo@x", "DTSTART:20260901T090000Z", "SUMMARY:One off"),
  );
  assert.equal(event.uid, "solo@x");
});

test("junk in, nothing out — rather than a crash", () => {
  assert.deepEqual(parseIcs("not a calendar at all"), []);
  assert.deepEqual(parseIcs(vevent("UID:x@x", "SUMMARY:No start date")), []);
});

test("an event with no SUMMARY still imports with a placeholder title", () => {
  const [event] = parseIcs(vevent("UID:l@x", "DTSTART:20260901T090000Z"));
  assert.equal(event.title, "Untitled event");
});

test("an unbounded rule is capped rather than running forever", () => {
  const events = parseIcs(
    vevent("UID:m@x", "DTSTART:20260101T090000Z", "RRULE:FREQ=DAILY", "SUMMARY:Endless"),
  );
  assert.ok(events.length <= 120, `capped, got ${events.length}`);
});
