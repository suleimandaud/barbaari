<?php

use App\Http\Controllers\ApiController;
use App\Http\Controllers\AuthController;
use Illuminate\Support\Facades\Route;

Route::get('public/pricing-plans', [ApiController::class, 'publicPricingPlans']);
Route::post('registration-applications', [ApiController::class, 'createFacilityRegistrationApplication'])->middleware('throttle:10,1');

Route::prefix('auth')->middleware('throttle:auth')->group(function () {
    Route::post('register', [AuthController::class, 'register']);
    Route::post('login', [AuthController::class, 'login']);
    Route::post('pin-login', [AuthController::class, 'pinLogin']);
    Route::post('tablet-unlock', [AuthController::class, 'tabletUnlock']);
    Route::post('otp/verify', [AuthController::class, 'otp']);
    Route::post('forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
    Route::post('reset-password', [AuthController::class, 'resetPassword']);
    Route::middleware('auth:sanctum')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('verify-pin', [AuthController::class, 'verifyPin']);
        Route::post('password-reset-smoke', [AuthController::class, 'passwordResetSmoke'])->middleware('role:super_admin,support_staff');
        Route::post('logout', [AuthController::class, 'logout']);
    });
});

Route::middleware('throttle:invitations')->group(function () {
    Route::get('invitations/{token}', [AuthController::class, 'showInvitation']);
    Route::post('invitations/{token}/accept', [AuthController::class, 'acceptInvitation']);
});

Route::middleware(['auth:sanctum', 'subscription.active'])->group(function () {
    Route::get('mobile/children', [ApiController::class, 'children']);
    Route::get('mobile/attendance', [ApiController::class, 'attendance']);
    Route::get('mobile/absence-records', [ApiController::class, 'absenceRecords']);
    Route::get('mobile/invoices', [ApiController::class, 'invoices'])->middleware('role:parent');
    Route::get('mobile/payments', [ApiController::class, 'paymentHistory'])->middleware('role:parent');
    Route::get('mobile/documents', [ApiController::class, 'documents']);
    Route::get('mobile/incidents', [ApiController::class, 'incidents']);
    Route::get('mobile/messages', [ApiController::class, 'conversations']);
    Route::get('mobile/notifications', [ApiController::class, 'notifications']);

    Route::get('children', [ApiController::class, 'children']);
    Route::post('children', [ApiController::class, 'createChild'])->middleware('role:daycare_admin,manager');
    Route::get('children/{child}', [ApiController::class, 'showChild']);
    Route::put('children/{child}', [ApiController::class, 'updateChild'])->middleware('role:daycare_admin,manager');
    Route::delete('children/{child}', [ApiController::class, 'deleteChild'])->middleware('role:daycare_admin,manager');
    Route::post('children/{child}/assign-classroom', [ApiController::class, 'assignClassroom'])->middleware('role:daycare_admin,manager');
    Route::post('children/{child}/guardians', [ApiController::class, 'linkGuardian'])->middleware('role:daycare_admin,manager');

    Route::get('guardians', [ApiController::class, 'guardians']);
    Route::post('guardians', [ApiController::class, 'createGuardian'])->middleware('role:daycare_admin,manager');
    Route::put('guardians/{guardian}', [ApiController::class, 'updateGuardian'])->middleware('role:daycare_admin,manager');
    Route::post('guardians/{guardian}/send-invite', [ApiController::class, 'sendGuardianInvite'])->middleware('role:daycare_admin,manager');
    Route::post('guardians/{guardian}/send-password-reset', [ApiController::class, 'sendGuardianPasswordReset'])->middleware('role:daycare_admin,manager');
    Route::post('guardians/{guardian}/reset-pin', [ApiController::class, 'resetGuardianPin'])->middleware('role:daycare_admin,manager');

    Route::post('attendance/check-in', [ApiController::class, 'checkIn'])->middleware('role:staff,teacher,daycare_admin,manager');
    Route::post('attendance/check-out', [ApiController::class, 'checkOut'])->middleware('role:staff,teacher,daycare_admin,manager');
    Route::get('children/{child}/pickup-signers', [ApiController::class, 'pickupSigners']);
    Route::post('attendance/guardian-check-in', [ApiController::class, 'guardianCheckIn']);
    Route::post('attendance/guardian-check-out', [ApiController::class, 'guardianCheckOut']);
    Route::get('attendance', [ApiController::class, 'attendance']);
    Route::get('attendance/history', [ApiController::class, 'attendanceHistory']);
    Route::post('attendance/{record}/correct', [ApiController::class, 'correctAttendance'])->middleware('role:daycare_admin,manager');
    Route::get('attendance/audit-logs', [ApiController::class, 'attendanceAudits'])->middleware('role:daycare_admin,manager');
    Route::get('attendance/export', [ApiController::class, 'attendanceExport'])->middleware('role:daycare_admin,manager');
    Route::get('absence-records', [ApiController::class, 'absenceRecords']);
    Route::post('absence-records', [ApiController::class, 'createAbsenceRecord'])->middleware('role:daycare_admin,manager,staff,teacher');
    Route::get('absence-records/{absence}', [ApiController::class, 'showAbsenceRecord']);
    Route::patch('absence-records/{absence}', [ApiController::class, 'updateAbsenceRecord'])->middleware('role:daycare_admin,manager,staff,teacher');
    Route::delete('absence-records/{absence}', [ApiController::class, 'cancelAbsenceRecord'])->middleware('role:daycare_admin,manager,staff,teacher');

    Route::get('classrooms', [ApiController::class, 'classrooms']);
    Route::post('classrooms', [ApiController::class, 'createClassroom'])->middleware('role:daycare_admin,manager');
    Route::put('classrooms/{classroom}', [ApiController::class, 'updateClassroom'])->middleware('role:daycare_admin,manager');
    Route::delete('classrooms/{classroom}', [ApiController::class, 'deleteClassroom'])->middleware('role:daycare_admin,manager');

    Route::get('users', [ApiController::class, 'users'])->middleware('role:daycare_admin,manager');
    Route::post('users', [ApiController::class, 'createUser'])->middleware('role:daycare_admin,manager');
    Route::put('users/{user}', [ApiController::class, 'updateUser'])->middleware('role:daycare_admin,manager');
    Route::post('users/{user}/assign-role', [ApiController::class, 'assignRole'])->middleware('role:daycare_admin,manager');
    Route::post('users/{user}/status', [ApiController::class, 'updateUserStatus'])->middleware('role:daycare_admin,manager');

    Route::get('staff/profile', [ApiController::class, 'staffProfile'])->middleware('role:staff,teacher,daycare_admin,manager');
    Route::post('staff', [ApiController::class, 'createUser'])->middleware('role:daycare_admin,manager');
    Route::patch('staff/{user}', [ApiController::class, 'updateUser'])->middleware('role:daycare_admin,manager');
    Route::patch('staff/{user}/assign-classroom', [ApiController::class, 'assignStaffClassroom'])->middleware('role:daycare_admin,manager');
    Route::patch('staff/{user}/activate', [ApiController::class, 'activateStaffUser'])->middleware('role:daycare_admin,manager');
    Route::patch('staff/{user}/deactivate', [ApiController::class, 'deactivateStaffUser'])->middleware('role:daycare_admin,manager');
    Route::post('staff/{user}/reset-pin', [ApiController::class, 'resetStaffPin'])->middleware('role:daycare_admin,manager');
    Route::post('staff/{user}/send-invite', [ApiController::class, 'sendStaffInvite'])->middleware('role:daycare_admin,manager');
    Route::post('staff/{user}/send-password-reset', [ApiController::class, 'sendStaffPasswordReset'])->middleware('role:daycare_admin,manager');
    Route::post('staff/check-in', [ApiController::class, 'staffCheckIn'])->middleware('role:staff,teacher,daycare_admin,manager');
    Route::post('staff/check-out', [ApiController::class, 'staffCheckOut'])->middleware('role:staff,teacher,daycare_admin,manager');
    Route::get('staff/classroom-children', [ApiController::class, 'staffClassroomChildren'])->middleware('role:staff,teacher');
    Route::get('staff/activity', [ApiController::class, 'staffActivity'])->middleware('role:daycare_admin,manager,staff,teacher');

    Route::get('tablet/bootstrap', [ApiController::class, 'tabletBootstrap'])->middleware('role:parent,staff,teacher,daycare_admin,manager');
    Route::get('tablet/children/{child}/pickup-signers', [ApiController::class, 'tabletPickupSigners'])->middleware('role:parent,staff,teacher,daycare_admin,manager');
    Route::get('tablet/children/{child}/signers', [ApiController::class, 'tabletChildSigners'])->middleware('role:parent,staff,teacher,daycare_admin,manager');
    Route::post('tablet/signers/verify-pin', [ApiController::class, 'tabletVerifySignerPin'])->middleware('role:parent,staff,teacher,daycare_admin,manager');
    Route::post('tablet/attendance/guardian-check-in', [ApiController::class, 'tabletGuardianCheckIn'])->middleware('role:parent,staff,teacher,daycare_admin,manager');
    Route::post('tablet/attendance/guardian-check-out', [ApiController::class, 'tabletGuardianCheckOut'])->middleware('role:parent,staff,teacher,daycare_admin,manager');
    Route::post('tablet/absence-records', [ApiController::class, 'tabletCreateAbsenceRecord'])->middleware('role:parent,staff,teacher,daycare_admin,manager');

    Route::get('billing/invoices', [ApiController::class, 'invoices']);
    Route::get('billing/invoices/{invoice}', [ApiController::class, 'showInvoice']);
    Route::post('billing/invoices', [ApiController::class, 'createInvoice'])->middleware('role:daycare_admin,manager,billing_manager');
    Route::post('billing/invoices/{invoice}/payments', [ApiController::class, 'recordPayment'])->middleware('role:daycare_admin,manager,billing_manager');
    Route::get('billing/payments', [ApiController::class, 'paymentHistory']);
    Route::get('billing/receipts/{receipt}/download', [ApiController::class, 'receiptDownload']);
    Route::post('billing/stripe/placeholder', [ApiController::class, 'stripePlaceholder']);
    Route::get('daycare/subscription', [ApiController::class, 'daycareSubscription'])->middleware('role:daycare_admin,manager');
    Route::get('daycare/billing/invoices', [ApiController::class, 'daycarePlatformInvoices'])->middleware('role:daycare_admin,manager');
    Route::get('daycare/billing/invoices/{invoice}/pdf', [ApiController::class, 'downloadInvoicePdf'])->middleware('role:daycare_admin,manager');
    Route::get('daycare/billing/payments', [ApiController::class, 'daycarePlatformPayments'])->middleware('role:daycare_admin,manager');
    Route::post('daycare/billing/request-plan-change', [ApiController::class, 'requestPlanChange'])->middleware('role:daycare_admin,manager');
    Route::post('daycare/billing/stripe/create-checkout-session', [ApiController::class, 'createStripeCheckoutSession'])->middleware('role:daycare_admin,manager');
    Route::post('daycare/billing/stripe/cancel-subscription', [ApiController::class, 'cancelStripeSubscription'])->middleware('role:daycare_admin,manager');
    Route::post('daycare/billing/stripe/confirm-session', [ApiController::class, 'confirmStripeSession'])->middleware('role:daycare_admin,manager');
    Route::post('daycare/billing/test-payment-success', [ApiController::class, 'testPaymentSuccess'])->middleware('role:daycare_admin,manager');

    Route::post('incidents', [ApiController::class, 'createIncident'])->middleware('role:staff,teacher,daycare_admin,manager');
    Route::get('incidents', [ApiController::class, 'incidents']);
    Route::get('incidents/{incident}', [ApiController::class, 'showIncident']);
    Route::put('incidents/{incident}', [ApiController::class, 'updateIncident'])->middleware('role:staff,teacher,daycare_admin,manager');
    Route::post('incidents/{incident}/notify-parent', [ApiController::class, 'notifyParent'])->middleware('role:staff,teacher,daycare_admin,manager');

    Route::get('daily-notes', [ApiController::class, 'dailyNotes']);
    Route::post('daily-notes', [ApiController::class, 'createDailyNote'])->middleware('role:staff,teacher,daycare_admin,manager');
    Route::put('daily-notes/{note}', [ApiController::class, 'updateDailyNote'])->middleware('role:staff,teacher,daycare_admin,manager');

    Route::get('conversations', [ApiController::class, 'conversations']);
    Route::post('conversations', [ApiController::class, 'createConversation']);
    Route::get('conversations/{conversation}/messages', [ApiController::class, 'conversationMessages']);
    Route::post('messages', [ApiController::class, 'sendMessage']);
    Route::get('notifications', [ApiController::class, 'notifications']);
    Route::get('notifications/unread-count', [ApiController::class, 'unreadNotificationCount']);
    Route::patch('notifications/read-all', [ApiController::class, 'markAllNotificationsRead']);
    Route::post('notifications/test', [ApiController::class, 'createTestNotification']);
    Route::post('notifications', [ApiController::class, 'createNotification'])->middleware('role:daycare_admin,manager');
    Route::patch('notifications/{notification}/read', [ApiController::class, 'markNotificationRead']);
    Route::post('notifications/{notification}/read', [ApiController::class, 'markNotificationRead']);
    Route::delete('notifications/{notification}', [ApiController::class, 'deleteNotification']);
    Route::post('announcements', [ApiController::class, 'announcement'])->middleware('role:daycare_admin,manager');

    Route::post('documents', [ApiController::class, 'uploadDocument'])->middleware('role:daycare_admin,manager,staff,teacher');
    Route::get('documents', [ApiController::class, 'documents']);
    Route::get('documents/{document}/download', [ApiController::class, 'downloadDocument']);
    Route::delete('documents/{document}', [ApiController::class, 'deleteDocument'])->middleware('role:daycare_admin,manager');

    Route::get('devices', [ApiController::class, 'devices'])->middleware('role:daycare_admin,manager');
    Route::post('devices', [ApiController::class, 'registerDevice'])->middleware('role:daycare_admin,manager');
    Route::post('devices/{device}/assign-classroom', [ApiController::class, 'assignDeviceClassroom'])->middleware('role:daycare_admin,manager');
    Route::post('devices/{device}/disable', [ApiController::class, 'disableDevice'])->middleware('role:daycare_admin,manager');

    Route::prefix('reports')->middleware('role:daycare_admin,manager,billing_manager')->group(function () {
        Route::get('dashboard', [ApiController::class, 'managerDashboard']);
        Route::get('attendance', [ApiController::class, 'attendanceReport']);
        Route::get('revenue', [ApiController::class, 'revenueReport']);
        Route::get('staff-activity', [ApiController::class, 'staffActivity']);
        Route::get('occupancy', [ApiController::class, 'occupancyReport']);
        Route::get('dcyf-export', [ApiController::class, 'dcyfExport']);
    });

    Route::prefix('manager')->middleware(['role:daycare_admin,manager,billing_manager', 'subscription.active'])->group(function () {
        Route::get('dashboard', [ApiController::class, 'managerDashboard']);
        Route::get('organization', [ApiController::class, 'organization']);
        Route::put('organization', [ApiController::class, 'updateOrganization']);
        Route::get('users', [ApiController::class, 'users']);
        Route::get('children', [ApiController::class, 'children']);
        Route::get('guardians', [ApiController::class, 'guardians']);
        Route::get('attendance', [ApiController::class, 'attendance']);
        Route::get('absence-records', [ApiController::class, 'absenceRecords']);
        Route::get('classrooms', [ApiController::class, 'classrooms']);
        Route::get('billing', [ApiController::class, 'invoices']);
        Route::get('reports', [ApiController::class, 'incidents']);
        Route::get('daily-notes', [ApiController::class, 'dailyNotes']);
        Route::get('audit-logs', [ApiController::class, 'attendanceAudits']);
        Route::get('devices', [ApiController::class, 'devices']);
        Route::get('staff', [ApiController::class, 'staff']);
        Route::get('documents', [ApiController::class, 'documents']);
    });

    Route::prefix('platform')->middleware('role:super_admin,support_staff')->group(function () {
        Route::get('dashboard', [ApiController::class, 'platformDashboard']);
        Route::get('billing/dashboard', [ApiController::class, 'platformBillingDashboard'])->middleware('role:super_admin');
        Route::get('organizations', [ApiController::class, 'platformOrganizations']);
        Route::post('organizations', [ApiController::class, 'createOrganization'])->middleware('role:super_admin');
        Route::get('registration-applications', [ApiController::class, 'platformRegistrationApplications'])->middleware('role:super_admin');
        Route::post('registration-applications/{application}/approve', [ApiController::class, 'approveRegistrationApplication'])->middleware('role:super_admin');
        Route::post('registration-applications/{application}/reject', [ApiController::class, 'rejectRegistrationApplication'])->middleware('role:super_admin');
        Route::post('registration-applications/{application}/follow-up', [ApiController::class, 'requestRegistrationApplicationFollowUp'])->middleware('role:super_admin');
        Route::post('organizations/{organization}/status', [ApiController::class, 'updateOrganizationStatus']);
        Route::post('organizations/{organization}/generate-invoice', [ApiController::class, 'generateOrgInvoice'])->middleware('role:super_admin');
        Route::patch('organizations/{organization}/location', [ApiController::class, 'updateOrganizationLocation'])->middleware('role:super_admin');
        Route::get('organizations/{organization}/location-alerts', [ApiController::class, 'organizationLocationAlerts'])->middleware('role:super_admin');
        Route::get('organizations/{organization}/users', [ApiController::class, 'organizationUsers'])->middleware('role:super_admin');
        Route::post('organizations/{organization}/users', [ApiController::class, 'createOrganizationUser'])->middleware('role:super_admin');
        Route::patch('organizations/{organization}/users/{user}/disable', [ApiController::class, 'disableOrganizationUser'])->middleware('role:super_admin');
        Route::patch('organizations/{organization}/users/{user}/enable', [ApiController::class, 'enableOrganizationUser'])->middleware('role:super_admin');
        Route::get('organizations/{organization}/invitations', [ApiController::class, 'organizationInvitations'])->middleware('role:super_admin');
        Route::post('organizations/{organization}/invitations', [ApiController::class, 'createOrganizationInvite'])->middleware('role:super_admin');
        Route::post('organizations/{organization}/invitations/{invitation}/resend', [ApiController::class, 'resendOrganizationInvitation'])->middleware('role:super_admin');
        Route::delete('organizations/{organization}/invitations/{invitation}', [ApiController::class, 'cancelOrganizationInvitation'])->middleware('role:super_admin');
        Route::get('subscriptions', [ApiController::class, 'platformSubscriptions'])->middleware('role:super_admin');
        Route::post('subscriptions', [ApiController::class, 'createPlatformSubscription'])->middleware('role:super_admin');
        Route::put('subscriptions/{subscription}', [ApiController::class, 'updatePlatformSubscription'])->middleware('role:super_admin');
        Route::patch('subscriptions/{subscription}/status', [ApiController::class, 'updateSubscriptionStatus'])->middleware('role:super_admin');
        Route::patch('subscriptions/{subscription}/pause', [ApiController::class, 'pausePlatformSubscription'])->middleware('role:super_admin');
        Route::patch('subscriptions/{subscription}/resume', [ApiController::class, 'resumePlatformSubscription'])->middleware('role:super_admin');
        Route::patch('subscriptions/{subscription}/cancel', [ApiController::class, 'cancelPlatformSubscription'])->middleware('role:super_admin');
        Route::patch('subscriptions/{subscription}/suspend', [ApiController::class, 'suspendPlatformSubscription'])->middleware('role:super_admin');
        Route::patch('subscriptions/{subscription}/change-plan', [ApiController::class, 'changeSubscriptionPlan'])->middleware('role:super_admin');
        Route::patch('subscriptions/{subscription}/plan', [ApiController::class, 'changeSubscriptionPlan'])->middleware('role:super_admin');
        Route::get('invoices', [ApiController::class, 'platformInvoices'])->middleware('role:super_admin');
        Route::post('invoices', [ApiController::class, 'createPlatformInvoice'])->middleware('role:super_admin');
        Route::get('invoices/{invoice}', [ApiController::class, 'showPlatformInvoice'])->middleware('role:super_admin');
        Route::get('invoices/{invoice}/pdf', [ApiController::class, 'downloadPlatformInvoicePdf'])->middleware('role:super_admin');
        Route::patch('invoices/{invoice}/mark-paid', [ApiController::class, 'markPlatformInvoicePaid'])->middleware('role:super_admin');
        Route::post('invoices/{invoice}/payments', [ApiController::class, 'recordPlatformInvoicePayment'])->middleware('role:super_admin');
        Route::patch('invoices/{invoice}/void', [ApiController::class, 'voidPlatformInvoice'])->middleware('role:super_admin');
        Route::get('payments', [ApiController::class, 'platformPayments'])->middleware('role:super_admin');
        Route::get('payments/{payment}/receipt', [ApiController::class, 'downloadPlatformPaymentReceiptPdf'])->middleware('role:super_admin');
        Route::get('pricing-plans', [ApiController::class, 'platformPricingPlans'])->middleware('role:super_admin');
        Route::post('pricing-plans', [ApiController::class, 'createPricingPlan'])->middleware('role:super_admin');
        Route::match(['put', 'patch'], 'pricing-plans/{plan}', [ApiController::class, 'updatePricingPlan'])->middleware('role:super_admin');
        Route::patch('pricing-plans/{plan}/activate', [ApiController::class, 'activatePricingPlan'])->middleware('role:super_admin');
        Route::patch('pricing-plans/{plan}/deactivate', [ApiController::class, 'deactivatePricingPlan'])->middleware('role:super_admin');
        Route::post('billing/stripe/sync-plan', [ApiController::class, 'syncStripePlan'])->middleware('role:super_admin');
        Route::get('users', [ApiController::class, 'platformUsers']);
        Route::patch('users/{user}/block', [ApiController::class, 'blockPlatformUser']);
        Route::patch('users/{user}/unblock', [ApiController::class, 'unblockPlatformUser']);
        Route::post('users/{user}/reset-account', [ApiController::class, 'resetPlatformUser']);
        Route::patch('users/{user}/role', [ApiController::class, 'updatePlatformUserRole']);
        Route::get('support', [ApiController::class, 'supportTickets']);
        Route::get('support-tickets', [ApiController::class, 'supportTickets']);
        Route::post('support-tickets', [ApiController::class, 'createSupportTicket']);
        Route::match(['put', 'patch'], 'support-tickets/{ticket}', [ApiController::class, 'updateSupportTicket']);
        Route::patch('support-tickets/{ticket}/status', [ApiController::class, 'updateSupportTicketStatus']);
        Route::post('support-tickets/{ticket}/comments', [ApiController::class, 'commentSupportTicket']);
        Route::patch('support-tickets/{ticket}/close', [ApiController::class, 'closeSupportTicket']);
        Route::get('security', [ApiController::class, 'auditLogs']);
        Route::get('audit-logs', [ApiController::class, 'auditLogs']);
        Route::get('settings', [ApiController::class, 'platformSettings']);
        Route::put('settings', [ApiController::class, 'updatePlatformSettings']);
        Route::patch('settings', [ApiController::class, 'updatePlatformSettings']);
        Route::patch('settings/bulk', [ApiController::class, 'bulkUpdatePlatformSettings']);
        Route::get('system-alerts', [ApiController::class, 'systemAlerts']);
        Route::post('system-alerts', [ApiController::class, 'createSystemAlert']);
        Route::patch('system-alerts/{alert}/resolve', [ApiController::class, 'resolveSystemAlert']);
        Route::patch('system-alerts/{alert}/reopen', [ApiController::class, 'reopenSystemAlert']);
        Route::get('monitoring', [ApiController::class, 'monitoringHealth']);
        Route::get('monitoring/health', [ApiController::class, 'monitoringHealth']);
        Route::get('analytics/billing/overview', [ApiController::class, 'billingAnalyticsOverview'])->middleware('role:super_admin');
        Route::get('analytics/billing/revenue-by-month', [ApiController::class, 'billingAnalyticsRevenueByMonth'])->middleware('role:super_admin');
        Route::get('analytics/billing/top-organizations', [ApiController::class, 'billingAnalyticsTopOrganizations'])->middleware('role:super_admin');
        Route::get('organizations/{organization}/invoices/{invoice}/pdf', [ApiController::class, 'downloadPlatformInvoicePdf'])->middleware('role:super_admin');
    });

    Route::prefix('super-admin')->middleware('role:super_admin,support_staff')->group(function () {
        Route::get('pricing-plans', [ApiController::class, 'platformPricingPlans']);
        Route::post('pricing-plans', [ApiController::class, 'createPricingPlan']);
        Route::match(['put', 'patch'], 'pricing-plans/{plan}', [ApiController::class, 'updatePricingPlan']);
        Route::patch('pricing-plans/{plan}/activate', [ApiController::class, 'activatePricingPlan']);
        Route::patch('pricing-plans/{plan}/deactivate', [ApiController::class, 'deactivatePricingPlan']);
        Route::get('users', [ApiController::class, 'platformUsers']);
        Route::patch('users/{user}/block', [ApiController::class, 'blockPlatformUser']);
        Route::patch('users/{user}/unblock', [ApiController::class, 'unblockPlatformUser']);
        Route::post('users/{user}/reset-account', [ApiController::class, 'resetPlatformUser']);
        Route::patch('users/{user}/role', [ApiController::class, 'updatePlatformUserRole']);
        Route::get('support-tickets', [ApiController::class, 'supportTickets']);
        Route::post('support-tickets', [ApiController::class, 'createSupportTicket']);
        Route::match(['put', 'patch'], 'support-tickets/{ticket}', [ApiController::class, 'updateSupportTicket']);
        Route::patch('support-tickets/{ticket}/status', [ApiController::class, 'updateSupportTicketStatus']);
        Route::post('support-tickets/{ticket}/comments', [ApiController::class, 'commentSupportTicket']);
        Route::patch('support-tickets/{ticket}/close', [ApiController::class, 'closeSupportTicket']);
        Route::get('platform-settings', [ApiController::class, 'platformSettings']);
        Route::patch('platform-settings', [ApiController::class, 'updatePlatformSettings']);
        Route::patch('platform-settings/bulk', [ApiController::class, 'bulkUpdatePlatformSettings']);
        Route::get('system-alerts', [ApiController::class, 'systemAlerts']);
        Route::post('system-alerts', [ApiController::class, 'createSystemAlert']);
        Route::patch('system-alerts/{alert}/resolve', [ApiController::class, 'resolveSystemAlert']);
        Route::patch('system-alerts/{alert}/reopen', [ApiController::class, 'reopenSystemAlert']);
        Route::get('monitoring/health', [ApiController::class, 'monitoringHealth']);
    });
});

Route::post('webhooks/stripe', [ApiController::class, 'stripeWebhook'])->middleware('throttle:stripe-webhook');
