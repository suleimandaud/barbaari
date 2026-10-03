/** "3 yrs 4 mo" from an ISO date of birth, matching the redesign's child rows. */
export function ageLabel(dob?: string | null, fallback?: string) {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return fallback && fallback !== "Unknown" ? fallback : "—";
  const birth = new Date(`${dob.slice(0, 10)}T12:00:00`);
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return "—";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return `${rest} mo`;
  return rest ? `${years} yrs ${rest} mo` : `${years} yrs`;
}

/** Today's attendance status per child, from today's records, open check-ins and absences. */
export function todayStatusByChild(attendance: any[], absences: any[], today: string) {
  const map = new Map<string, { key: string; record?: any; absence?: any }>();
  for (const absence of absences) {
    if ((absence.absenceDate ?? absence.absence_date) === today && absence.status !== "cancelled") map.set(String(absence.childId), { key: "absent", absence });
  }
  for (const record of attendance) {
    if (record.status === "missing_checkout" && !map.has(String(record.childId))) map.set(String(record.childId), { key: "missing_checkout", record });
  }
  for (const record of attendance) {
    if (record.date === today) map.set(String(record.childId), { key: record.status ?? (record.checkOutTime ? "checked_out" : "checked_in"), record });
  }
  return map;
}
