import type { Role } from "./roles";

export type AttendanceStatus = "checked_in" | "checked_out" | "absent" | "late";
export type InvoiceStatus = "paid" | "open" | "overdue";
export type OrganizationStatus = "active" | "trial" | "suspended" | "pending";

export interface User {
  id: string;
  name: string;
  role: Role;
  organizationId?: string;
}

export interface Child {
  id: string;
  child_code?: string;
  childCode?: string;
  name: string;
  age: string;
  dateOfBirth?: string;
  date_of_birth?: string;
  classroom: string;
  classroomId?: string | number;
  guardianNames: string[];
  primaryGuardianName?: string;
  allergies: string[];
  avatar: string;
  attendanceStatus: AttendanceStatus;
}

export interface AttendanceRecord {
  id: string;
  childId: string;
  childCode?: string;
  child_code?: string;
  childName: string;
  classroom: string;
  date: string;
  timezone?: string;
  checkInAt?: string;
  checkOutAt?: string;
  checkInLocal?: string;
  checkOutLocal?: string;
  checkInTime?: string;
  checkOutTime?: string;
  signedBy: string;
  assistingStaffId?: string;
  assistingStaffName?: string;
  verificationMethod: "pin" | "qr" | "secure_login" | "digital_signature";
  corrected: boolean;
  correctionReason?: string;
  originalRecordId?: string;
}

export interface IncidentReport {
  id: string;
  childName: string;
  classroom: string;
  severity: "low" | "medium" | "high";
  status: "draft" | "sent" | "resolved";
  summary: string;
  occurredAt: string;
  staffName: string;
}

export interface Invoice {
  id: string;
  childName: string;
  amount: number;
  dueDate: string;
  status: InvoiceStatus;
}

export interface Organization {
  id: string;
  name: string;
  status: OrganizationStatus;
  licenseNumber: string;
  city: string;
  children: number;
  staff: number;
  plan: string;
  mrr: number;
}

export interface Metric {
  label: string;
  value: string;
  detail: string;
  tone?: "primary" | "secondary" | "tertiary" | "danger" | "neutral";
}
