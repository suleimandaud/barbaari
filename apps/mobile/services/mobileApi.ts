import { absenceApi, attendanceApi, authApi, billingApi, childrenApi, dailyNotesApi, documentsApi, incidentApi, messagesApi, notificationsApi, staffApi, tabletApi } from "@barbaari/shared";

export const mobileApi = {
  async parentHome() {
    const [children, attendance, absences, invoices, payments, incidents, notifications, messages, documents, notes] = await Promise.all([
      childrenApi.mobileList(),
      attendanceApi.mobileList(),
      absenceApi.mobileList(),
      billingApi.mobileInvoices(),
      billingApi.mobilePayments(),
      incidentApi.mobileList(),
      notificationsApi.mobileList(),
      messagesApi.mobileConversations(),
      documentsApi.mobileList(),
      dailyNotesApi.list()
    ]);
    return { children: children.children, attendance: attendance.attendance, absences: absences.absence_records, invoices: invoices.invoices, payments: payments.payments, incidents: incidents.incidents, notifications: notifications.notifications, messages: messages.conversations, documents: documents.documents, notes: notes.daily_notes };
  },
  childProfile(id: string | number) {
    return childrenApi.get(id);
  },
  children: () => childrenApi.mobileList(),
  pickupSigners: childrenApi.pickupSigners,
  attendance: () => attendanceApi.mobileList(),
  absences: () => absenceApi.mobileList(),
  createAbsence: absenceApi.create,
  invoices: () => billingApi.mobileInvoices(),
  payments: () => billingApi.mobilePayments(),
  receipts: (id: string | number) => billingApi.receiptDownload(id),
  incidents: () => incidentApi.mobileList(),
  createIncident: incidentApi.create,
  notes: () => dailyNotesApi.list(),
  createNote: dailyNotesApi.create,
  messages: () => messagesApi.mobileConversations(),
  sendMessage: messagesApi.send,
  notifications: () => notificationsApi.mobileList(),
  markNotificationRead: notificationsApi.markRead,
  markAllNotificationsRead: notificationsApi.markAllRead,
  notificationUnreadCount: notificationsApi.unreadCount,
  documents: () => documentsApi.mobileList(),
  staffChildren: () => staffApi.classroomChildren(),
  tabletBootstrap: (mode?: string) => tabletApi.bootstrap(mode),
  staffCheckIn: staffApi.checkIn,
  staffCheckOut: staffApi.checkOut,
  verifyPin: authApi.verifyPin,
  checkChildIn: attendanceApi.checkIn,
  checkChildOut: attendanceApi.checkOut,
  markAbsent: tabletApi.markAbsent,
  guardianCheckIn: tabletApi.guardianCheckIn,
  guardianCheckOut: tabletApi.guardianCheckOut,
  tabletPickupSigners: tabletApi.pickupSigners,
  tabletSigners: tabletApi.signers,
  verifySignerPin: tabletApi.verifySignerPin
};
