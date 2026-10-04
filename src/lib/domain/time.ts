export const LEAGUE_TIME_ZONE = "America/New_York";

export function zonedDateTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let pass = 0; pass < 2; pass += 1) {
    const offset = timeZoneOffset(new Date(utc), timeZone);
    utc = Date.UTC(year, month - 1, day, hour, minute, 0) - offset;
  }
  return new Date(utc);
}

function timeZoneOffset(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  if (map.hour === 24) map.hour = 0;
  const asUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second,
  );
  return asUtc - date.getTime();
}

export function etParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LEAGUE_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === "24" ? "0" : map.hour),
    minute: Number(map.minute),
    weekday: map.weekday,
  };
}

export function isMondayKickoff(iso: string, timeZone = LEAGUE_TIME_ZONE): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  }).format(new Date(iso));
  return weekday === "Monday";
}

export function formatInTimeZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function formatEt(iso: string): string {
  return formatInTimeZone(iso, LEAGUE_TIME_ZONE);
}

export function formatScheduleDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: LEAGUE_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function scheduleDayKey(iso: string): string {
  const parts = etParts(new Date(iso));
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function currentSeasonYear(now: Date): number {
  const { year, month } = etParts(now);
  if (month <= 2) return year - 1;
  return year;
}

export function hasKickedOff(kickoffAt: string, now: Date): boolean {
  return new Date(kickoffAt).getTime() <= now.getTime();
}

/** NFL week containing `now`, anchored to the Thursday night opener. */
export function nflThursdayOf(now: Date): { year: number; month: number; day: number } {
  const parts = etParts(now);
  const weekdayIndex: Record<string, number> = {
    Thursday: 0,
    Friday: 1,
    Saturday: 2,
    Sunday: 3,
    Monday: 4,
    Tuesday: 5,
    Wednesday: 6,
  };
  const sinceThursday = weekdayIndex[parts.weekday] ?? 0;
  const back = sinceThursday <= 4 ? sinceThursday : sinceThursday - 7;
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - back));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function etKickoff(
  thursday: { year: number; month: number; day: number },
  dayOffset: number,
  hour: number,
  minute: number,
): string {
  const shifted = new Date(
    Date.UTC(thursday.year, thursday.month - 1, thursday.day + dayOffset),
  );
  return zonedDateTimeToUtc(
    LEAGUE_TIME_ZONE,
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    hour,
    minute,
  ).toISOString();
}

/**
 * 2026 regular season opener: Thursday, September 10.
 * Used only to label demo weeks. Live sync uses the provider's week number.
 */
export function seasonWeekNumber(thursday: { year: number; month: number; day: number }): number {
  const opener = zonedDateTimeToUtc(LEAGUE_TIME_ZONE, thursday.year, 9, 10, 12, 0);
  const current = zonedDateTimeToUtc(
    LEAGUE_TIME_ZONE,
    thursday.year,
    thursday.month,
    thursday.day,
    12,
    0,
  );
  const diffDays = Math.round((current.getTime() - opener.getTime()) / 86_400_000);
  const week = Math.floor(diffDays / 7) + 1;
  if (week < 1) return 1;
  if (week > 18) return 18;
  return week;
}

export function gameGroupLabel(kickoffAt: string): string {
  const { weekday, hour } = etParts(new Date(kickoffAt));
  if (weekday === "Sunday") {
    if (hour < 16) return "Sunday early";
    if (hour < 19) return "Sunday late";
    return "Sunday night";
  }
  return weekday;
}
