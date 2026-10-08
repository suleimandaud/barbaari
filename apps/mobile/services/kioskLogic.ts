import * as Location from "expo-location";
import * as Network from "expo-network";
import { getApiError } from "@barbaari/shared";

/*
 * Tablet/kiosk attendance rules shared by the phone kiosk layout and the tablet layout
 * (app/kiosk.tsx). Moved here verbatim from app/kiosk.tsx so both layouts run exactly the
 * same checks: status → allowed actions, subscription gate, device location, online check.
 */

export type Step = "welcome" | "subscription" | "classroom" | "child" | "action" | "signer" | "verify" | "signature" | "confirm";
// Only two real tablet-initiated attendance actions exist on the backend. "Early
// checkout"/"missing checkout" are NOT distinct actions anywhere in the API — they are
// status labels the backend computes after the fact by comparing check-out time against
// the organization's configured day-end time (ApiController::attendanceStatus). A prior
// version of this screen sent a client-side `early_checkout` flag that the backend never
// reads (confirmed: zero references in ApiController.php) — that was dead/fake signal,
// removed rather than kept, per "do not duplicate or fabricate backend logic."
export type Action = "in" | "out" | "absent";
export type Point = { x: number; y: number };
export type AbsenceType = "excused" | "unexcused" | "sick" | "vacation" | "no_show" | "other";
export type ChildStatus = "not checked in" | "checked in" | "checked out" | "early checkout" | "missing checkout" | "absent";

export const actionLabels: Record<Action, string> = {
  in: "Check in",
  out: "Check out",
  absent: "Mark absent"
};

export const absenceTypes: Array<[AbsenceType, string]> = [
  ["excused", "Excused"],
  ["unexcused", "Unexcused"],
  ["sick", "Sick"],
  ["vacation", "Vacation"],
  ["no_show", "No-show"],
  ["other", "Other"]
];

// Redesign 2026 tokens (design/redesign-2026/tokens.md), kept local to the tablet kiosk so

export function absenceLabel(value: AbsenceType) {
  return absenceTypes.find(([id]) => id === value)?.[1] ?? value.replace("_", " ");
}

export function statusFor(child: any, attendance: any[], absences: any[], localDate: string): ChildStatus {
  const record = attendance.find((item) => String(item.childId) === String(child.id) && item.date === localDate);
  const absence = absences.find((item) => String(item.childId) === String(child.id) && (item.absenceDate ?? item.absence_date) === localDate);
  if (absence) return "absent";
  if (!record) return "not checked in";
  if (record.status === "missing_checkout") return "missing checkout";
  if (record.status === "checked_out_early") return "early checkout";
  if (record.checkOutTime || record.status === "checked_out") return "checked out";
  return "checked in";
}

// Backend is the source of truth for status; this only decides which buttons a status
// makes valid — it never invents a new status or duplicates how the backend computes one.
export function actionsForStatus(status: ChildStatus): Action[] {
  if (status === "not checked in") return ["in", "absent"];
  if (status === "checked in") return ["out"];
  return []; // checked out / early checkout / missing checkout / absent — day is resolved
}

export function isSubscriptionRequiredError(err: unknown): boolean {
  return getApiError(err).status === 402;
}

// A GPS timeout or hardware-unavailable reading is common (weak signal indoors) and
// should not be reported the same as an actual permission denial — that sends staff
// hunting through device settings that are already fine.
export async function deviceLocation(): Promise<{ latitude: number; longitude: number }> {
  const existing = await Location.getForegroundPermissionsAsync();
  let permission = existing;
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    permission = await Location.requestForegroundPermissionsAsync();
  }
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    throw new Error("Location access is blocked for this device. Please allow location access in device settings and try again.");
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error("This device's location services (GPS) are turned off. Please enable them and try again.");
  }

  const TIMEOUT_MS = 10000;
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("Getting your location took too long. Please try again.")), TIMEOUT_MS);
  });

  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      timeout
    ]);
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch (error) {
    if (error instanceof Error && /took too long/.test(error.message)) throw error;
    throw new Error("This device could not determine its location. Please try again or move to an area with a clearer signal.");
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

export async function assertOnline() {
  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected || state.isInternetReachable === false) {
    throw new Error("Connection lost. Attendance cannot be recorded while this tablet is offline.");
  }
}
