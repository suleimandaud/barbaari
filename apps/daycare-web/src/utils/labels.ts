export function childCode(child: any) {
  return child?.childCode ?? child?.child_code ?? "Uncoded";
}

export function childDob(child: any) {
  return child?.dateOfBirth ?? child?.date_of_birth ?? "DOB not recorded";
}

export function childGuardian(child: any) {
  return child?.primaryGuardianName ?? child?.guardianNames?.[0] ?? "Not linked";
}

export function childLabel(child: any) {
  if (!child) return "Select child";
  const name = child.name ?? [child.first_name, child.last_name].filter(Boolean).join(" ") ?? "Child";
  return `${name} - ${child.classroom ?? "Unassigned"} - DOB: ${childDob(child)} - Guardian: ${childGuardian(child)} - ID: ${childCode(child)}`;
}

export function guardianLabel(guardian: any) {
  if (!guardian) return "Select guardian";
  return `${guardian.name}${guardian.phone ? ` - ${guardian.phone}` : ""}${guardian.email ? ` - ${guardian.email}` : ""}`;
}

export function classroomLabel(classroom: any) {
  if (!classroom) return "Select classroom";
  return `${classroom.name} - capacity ${classroom.capacity ?? "n/a"}${classroom.children_count !== undefined ? ` - ${classroom.children_count} enrolled` : ""}`;
}

export function friendlyError(message: string) {
  if (/selected child id is invalid/i.test(message)) return "Please select a child from the list.";
  if (/child id field is required/i.test(message)) return "Please select a child.";
  if (/No query results for model.*AttendanceRecord/i.test(message)) return "Please choose an attendance record from the table.";
  if (/check (in|out) time field must be a date before or equal to now/i.test(message)) return "Correction time cannot be in the future.";
  if (/selected classroom id is invalid/i.test(message)) return "Please select a classroom from the list.";
  if (/selected guardian id is invalid/i.test(message)) return "Please select a guardian from the list.";
  return message;
}
