import type { AttendanceRecord, Child, IncidentReport, Invoice, Metric, Organization } from "./types";

export const children: Child[] = [
  {
    id: "ch_001",
    name: "Ayan Hassan",
    age: "3 years",
    classroom: "Blue Room",
    guardianNames: ["Fadumo Hassan", "Abdi Noor"],
    allergies: ["Peanuts"],
    avatar: "AH",
    attendanceStatus: "checked_in"
  },
  {
    id: "ch_002",
    name: "Muna Ali",
    age: "4 years",
    classroom: "Sunshine",
    guardianNames: ["Hibo Ali"],
    allergies: [],
    avatar: "MA",
    attendanceStatus: "late"
  },
  {
    id: "ch_003",
    name: "Ibrahim Yusuf",
    age: "2 years",
    classroom: "Tiny Stars",
    guardianNames: ["Sahra Yusuf", "Omar Jama"],
    allergies: ["Dairy"],
    avatar: "IY",
    attendanceStatus: "checked_out"
  }
];

export const attendanceRecords: AttendanceRecord[] = [
  {
    id: "att_1001",
    childId: "ch_001",
    childName: "Ayan Hassan",
    classroom: "Blue Room",
    date: "2026-05-12",
    checkInTime: "08:04 AM",
    signedBy: "Fadumo Hassan",
    verificationMethod: "qr",
    corrected: false
  },
  {
    id: "att_1002",
    childId: "ch_002",
    childName: "Muna Ali",
    classroom: "Sunshine",
    date: "2026-05-12",
    checkInTime: "09:18 AM",
    signedBy: "Hibo Ali",
    verificationMethod: "pin",
    corrected: true,
    correctionReason: "Guardian forgot to complete kiosk flow; corrected from device audit trail.",
    originalRecordId: "att_0991"
  },
  {
    id: "att_1003",
    childId: "ch_003",
    childName: "Ibrahim Yusuf",
    classroom: "Tiny Stars",
    date: "2026-05-12",
    checkInTime: "07:51 AM",
    checkOutTime: "03:44 PM",
    signedBy: "Omar Jama",
    verificationMethod: "digital_signature",
    corrected: false
  }
];

export const incidents: IncidentReport[] = [
  {
    id: "inc_501",
    childName: "Ayan Hassan",
    classroom: "Blue Room",
    severity: "low",
    status: "sent",
    summary: "Minor playground scrape, cleaned and parent notified.",
    occurredAt: "10:42 AM",
    staffName: "Teacher Mariam"
  },
  {
    id: "inc_502",
    childName: "Muna Ali",
    classroom: "Sunshine",
    severity: "medium",
    status: "draft",
    summary: "Reported stomach discomfort after snack. Monitoring.",
    occurredAt: "11:15 AM",
    staffName: "Teacher Samira"
  }
];

export const invoices: Invoice[] = [
  { id: "inv_9001", childName: "Ayan Hassan", amount: 680, dueDate: "2026-05-15", status: "open" },
  { id: "inv_9002", childName: "Ibrahim Yusuf", amount: 620, dueDate: "2026-05-01", status: "paid" },
  { id: "inv_9003", childName: "Muna Ali", amount: 700, dueDate: "2026-04-30", status: "overdue" }
];

export const organizations: Organization[] = [
  {
    id: "org_001",
    name: "Little Lantern Daycare",
    status: "active",
    licenseNumber: "WA-DC-48291",
    city: "Seattle",
    children: 86,
    staff: 18,
    plan: "Growth",
    mrr: 349
  },
  {
    id: "org_002",
    name: "Bright Steps Learning",
    status: "trial",
    licenseNumber: "MN-CC-19118",
    city: "Minneapolis",
    children: 42,
    staff: 9,
    plan: "Starter",
    mrr: 149
  },
  {
    id: "org_003",
    name: "Safe Nest Kids",
    status: "suspended",
    licenseNumber: "OH-EL-77204",
    city: "Columbus",
    children: 65,
    staff: 14,
    plan: "Growth",
    mrr: 0
  }
];

export const daycareMetrics: Metric[] = [
  { label: "Total Children", value: "128", detail: "12 classrooms active", tone: "primary" },
  { label: "Present Today", value: "94", detail: "73% attendance", tone: "tertiary" },
  { label: "Revenue This Month", value: "$84.2k", detail: "$6.4k overdue", tone: "secondary" },
  { label: "Open Alerts", value: "7", detail: "2 missed check-outs", tone: "danger" }
];

export const platformMetrics: Metric[] = [
  { label: "Organizations", value: "248", detail: "213 active", tone: "primary" },
  { label: "MRR", value: "$72.6k", detail: "ARR $871.2k", tone: "secondary" },
  { label: "Active Users", value: "18.4k", detail: "2.1k staff today", tone: "tertiary" },
  { label: "System Alerts", value: "11", detail: "3 payment failures", tone: "danger" }
];
