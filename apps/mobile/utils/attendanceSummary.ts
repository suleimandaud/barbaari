type AttendanceSummary = {
  status: "not_checked_in" | "checked_in" | "checked_out" | "checked_out_early" | "absent" | "missing_checkout";
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
  dateLabel: string;
  lines: string[];
};

function todayIso(timezone = DEFAULT_ATTENDANCE_TIMEZONE) {
  return formatAttendanceDate(new Date(), timezone);
}

function yesterdayIso(timezone = DEFAULT_ATTENDANCE_TIMEZONE) {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return formatAttendanceDate(date, timezone);
}

function dateLabel(date?: string, timezone = DEFAULT_ATTENDANCE_TIMEZONE) {
  if (!date) return "No date";
  if (date === todayIso(timezone)) return "Today";
  if (date === yesterdayIso(timezone)) return "Yesterday";
  return date;
}

function beforeEnd(time?: string | null, dayEnd = "17:00") {
  return Boolean(time && time < dayEnd);
}

function isAfterDayEnd(dayEnd = "17:00") {
  const now = new Date();
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return current > dayEnd;
}

export function attendanceSummary(child: any, attendanceRecords: any[], absenceRecords: any[], dayEnd = "17:00", timezone = DEFAULT_ATTENDANCE_TIMEZONE): AttendanceSummary {
  const today = todayIso(timezone);
  const childId = String(child?.id ?? child?.childId ?? "");
  const records = attendanceRecords.filter((record) => String(record.childId ?? record.child_id) === childId);
  const absences = absenceRecords.filter((record) => String(record.childId ?? record.child_id) === childId);
  const todayAbsence = absences.find((record) => (record.absenceDate ?? record.absence_date) === today && record.status !== "cancelled");
  if (todayAbsence) {
    return {
      status: "absent",
      label: "Absent",
      tone: "warning",
      dateLabel: "Today",
      lines: [`${String(todayAbsence.absenceType ?? todayAbsence.absence_type ?? "absence").replace(/_/g, " ")}: ${todayAbsence.reason ?? "No reason entered"}`],
    };
  }

  const todayRecord = records.find((record) => record.date === today);
  if (todayRecord?.checkInTime && !todayRecord.checkOutTime) {
    if (todayRecord.status === "missing_checkout" || isAfterDayEnd(dayEnd)) {
      return {
        status: "missing_checkout",
        label: "Missing checkout",
        tone: "danger",
        dateLabel: "Today",
        lines: [`Checked in: ${todayRecord.checkInTime} by ${todayRecord.signedBy ?? "staff"}`, "No checkout recorded after the expected day end."],
      };
    }

    return {
      status: "checked_in",
      label: "Checked in",
      tone: "success",
      dateLabel: "Today",
      lines: [`Checked in: ${todayRecord.checkInTime} by ${todayRecord.signedBy ?? "staff"}`, "No checkout recorded yet."],
    };
  }
  if (todayRecord?.checkInTime && todayRecord.checkOutTime) {
    const early = beforeEnd(todayRecord.checkOutTime, dayEnd);
    return {
      status: early ? "checked_out_early" : "checked_out",
      label: early ? "Checked out early" : "Checked out",
      tone: early ? "warning" : "neutral",
      dateLabel: "Today",
      lines: [`Checked in: ${todayRecord.checkInTime} by ${todayRecord.signedBy ?? "staff"}`, `Checked out: ${todayRecord.checkOutTime} by ${todayRecord.signedBy ?? "staff"}`],
    };
  }

  const lastRecord = records[0];
  if (lastRecord) {
    if (lastRecord.checkInTime && !lastRecord.checkOutTime) {
      return {
        status: "missing_checkout",
        label: "Missing checkout",
        tone: "danger",
        dateLabel: "Today",
        lines: ["No attendance recorded today.", `Previous record from ${dateLabel(lastRecord.date, timezone)} is missing checkout: checked in at ${lastRecord.checkInTime}.`],
      };
    }

    return {
      status: "not_checked_in",
      label: "Not checked in",
      tone: "neutral",
      dateLabel: "Today",
      lines: ["No attendance recorded today.", `Last attendance: ${dateLabel(lastRecord.date, timezone)} (${lastRecord.checkInTime ?? "no check-in"}${lastRecord.checkOutTime ? ` - ${lastRecord.checkOutTime}` : ""})`],
    };
  }

  return {
    status: "not_checked_in",
    label: "Not checked in",
    tone: "neutral",
    dateLabel: "Today",
    lines: ["No attendance recorded today."],
  };
}
import { DEFAULT_ATTENDANCE_TIMEZONE, formatAttendanceDate } from "@barbaari/shared";
