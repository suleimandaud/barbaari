export const DEFAULT_ATTENDANCE_TIMEZONE = "Africa/Nairobi";

function formatter(timeZone?: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || DEFAULT_ATTENDANCE_TIMEZONE,
    ...options
  });
}

export function formatAttendanceTime(value?: string | Date | null, timezone = DEFAULT_ATTENDANCE_TIMEZONE) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return formatter(timezone, { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function formatAttendanceDate(value?: string | Date | null, timezone = DEFAULT_ATTENDANCE_TIMEZONE) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = formatter(timezone, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isTodayInTimezone(value?: string | Date | null, timezone = DEFAULT_ATTENDANCE_TIMEZONE) {
  if (!value) return false;
  return formatAttendanceDate(value, timezone) === formatAttendanceDate(new Date(), timezone);
}
