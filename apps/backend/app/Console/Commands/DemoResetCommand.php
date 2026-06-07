<?php

namespace App\Console\Commands;

use App\Models\AttendanceAuditLog;
use App\Models\AttendanceRecord;
use App\Models\AbsenceRecord;
use App\Models\AuditLog;
use App\Models\Child;
use App\Models\Classroom;
use App\Models\Conversation;
use App\Models\Device;
use App\Models\Document;
use App\Models\FacilityRegistrationApplication;
use App\Models\Guardian;
use App\Models\IncidentReport;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Message;
use App\Models\Notification;
use App\Models\Organization;
use App\Models\OrganizationInvitation;
use App\Models\OrganizationSetting;
use App\Models\Payment;
use App\Models\PaymentProviderEvent;
use App\Models\PlatformInvoice;
use App\Models\PlatformPayment;
use App\Models\PlatformSetting;
use App\Models\PricingPlan;
use App\Models\Role;
use App\Models\StaffProfile;
use App\Models\Subscription;
use App\Models\SupportTicket;
use App\Models\SupportTicketComment;
use App\Models\SystemAlert;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

class DemoResetCommand extends Command
{
    protected $signature = 'barbaari:demo-reset';

    protected $description = 'Reset the Little Lantern demo tenant and demo accounts to a clean active state.';

    private array $roles = [
        'super_admin' => 'Super Admin',
        'daycare_admin' => 'Daycare Admin',
        'manager' => 'Manager',
        'staff' => 'Staff',
        'teacher' => 'Teacher',
        'parent' => 'Parent',
        'billing_manager' => 'Billing Manager',
        'support_staff' => 'Support Staff',
    ];

    public function handle(): int
    {
        DB::transaction(function () {
            $roleModels = collect($this->roles)->mapWithKeys(fn ($label, $name) => [
                $name => Role::updateOrCreate(['name' => $name], ['label' => $label]),
            ]);

            PricingPlan::where('code', 'api-platform-test')->orWhere('name', 'API Platform Test')->delete();
            FacilityRegistrationApplication::whereIn('owner_email', ['api-family-provider@example.test', 'staging-family-provider@example.test'])->delete();
            PricingPlan::updateOrCreate(
                ['name' => 'Starter'],
                [
                    'code' => 'starter',
                    'name' => 'Starter',
                    'monthly_price' => 99,
                    'yearly_price' => 999,
                    'currency' => 'USD',
                    'child_limit' => 50,
                    'staff_limit' => 10,
                    'device_limit' => 2,
                    'features' => ['attendance', 'guardian_signing', 'reports'],
                    'status' => 'active',
                    'featured' => false,
                    'available_for_family_child_care' => true,
                    'available_for_center_daycare' => true,
                ]
            );
            $plan = PricingPlan::updateOrCreate(
                ['name' => 'Growth'],
                [
                    'code' => 'growth',
                    'name' => 'Growth',
                    'monthly_price' => 349,
                    'yearly_price' => 3490,
                    'currency' => 'USD',
                    'child_limit' => 150,
                    'staff_limit' => 30,
                    'device_limit' => 5,
                    'features' => ['attendance', 'tablet_mode', 'signatures', 'reports', 'notifications'],
                    'status' => 'active',
                    'featured' => true,
                    'available_for_family_child_care' => true,
                    'available_for_center_daycare' => true,
                ]
            );
            PricingPlan::updateOrCreate(
                ['name' => 'Enterprise'],
                [
                    'code' => 'enterprise',
                    'name' => 'Enterprise',
                    'monthly_price' => 799,
                    'yearly_price' => 7990,
                    'currency' => 'USD',
                    'child_limit' => 500,
                    'staff_limit' => 100,
                    'device_limit' => 20,
                    'features' => ['multi_site', 'advanced_reports', 'priority_support'],
                    'status' => 'active',
                    'featured' => false,
                    'available_for_family_child_care' => true,
                    'available_for_center_daycare' => true,
                ]
            );

            $this->clearStrayDemoOrganizations();

            $org = Organization::updateOrCreate(
                ['name' => 'Little Lantern Daycare'],
                [
                    'status' => 'active',
                    'organization_code' => 'LLD01',
                    'facility_type' => 'center_daycare',
                    'license_number' => 'LLD-2026-001',
                    'license_status' => 'verified',
                    'city' => 'Minneapolis',
                    'state' => 'MN',
                    'country' => 'USA',
                    'timezone' => 'Africa/Nairobi',
                    'phone' => '+1 612 555 0100',
                    'email' => 'hello@littlelantern.test',
                    'plan' => 'Growth',
                    'mrr' => 349,
                    'approved_at' => now()->subMonths(3),
                    'latitude' => -1.2921000,
                    'longitude' => 36.8219000,
                    'checkin_radius_meters' => 100,
                    'attendance_radius_meters' => 100,
                ]
            );

            $this->clearTenantData($org);

            OrganizationSetting::updateOrCreate(
                ['organization_id' => $org->id],
                [
                    'attendance_policy' => ['late_after' => '09:30', 'require_checkout_signature' => true, 'future_prefill_allowed' => false, 'attendance_timezone' => 'Africa/Nairobi'],
                    'billing_settings' => ['currency' => 'USD', 'invoice_day' => 1],
                    'notification_settings' => ['email' => true, 'sms' => false],
                ]
            );

            $subscription = Subscription::updateOrCreate(
                ['organization_id' => $org->id],
                [
                    'pricing_plan_id' => $plan->id,
                    'billing_cycle' => 'monthly',
                    'status' => 'active',
                    'provider' => 'manual',
                    'current_period_start' => now()->startOfMonth(),
                    'current_period_end' => now()->endOfMonth(),
                    'trial_ends_at' => null,
                    'current_period_ends_at' => now()->addMonth(),
                    'next_invoice_at' => now()->addMonth()->startOfDay(),
                    'stripe_customer_id' => 'cus_test_placeholder_little_lantern',
                    'stripe_subscription_id' => 'sub_placeholder_growth',
                    'notes' => 'Demo platform subscription. Manual payments are enabled; Stripe is test-mode ready.',
                ]
            );

            $super = $this->demoUser('Super Admin', 'super@barbaari.test', 'super_admin', null, $roleModels);
            $admin = $this->demoUser('Daycare Admin', 'admin@littlelantern.test', 'daycare_admin', $org->id, $roleModels, '123456');
            $manager = $this->demoUser('Daycare Manager', 'manager@littlelantern.test', 'manager', $org->id, $roleModels, '123456');
            $teacher = $this->demoUser('Blue Room Teacher', 'teacher@littlelantern.test', 'teacher', $org->id, $roleModels, '123456');
            $staff = $this->demoUser('Staff Assistant', 'staff@littlelantern.test', 'staff', $org->id, $roleModels, '123456');
            $parent = $this->demoUser('Amina Hassan', 'parent@littlelantern.test', 'parent', $org->id, $roleModels, '123456');
            $omar = $this->demoUser('Omar Yusuf', 'omar@example.test', 'parent', $org->id, $roleModels, '123456');

            $blue = Classroom::create(['organization_id' => $org->id, 'name' => 'Blue Room', 'capacity' => 18, 'lead_staff_id' => $teacher->id]);
            $sunshine = Classroom::create(['organization_id' => $org->id, 'name' => 'Sunshine', 'capacity' => 22, 'lead_staff_id' => $staff->id]);
            $toddlers = Classroom::create(['organization_id' => $org->id, 'name' => 'Toddler Nest', 'capacity' => 14, 'lead_staff_id' => null]);

            StaffProfile::create(['organization_id' => $org->id, 'user_id' => $manager->id, 'classroom_id' => null, 'title' => 'Daycare Manager', 'hired_on' => now()->subYear()->toDateString()]);
            StaffProfile::create(['organization_id' => $org->id, 'user_id' => $teacher->id, 'classroom_id' => $blue->id, 'title' => 'Lead Teacher', 'hired_on' => now()->subYear()->toDateString()]);
            StaffProfile::create(['organization_id' => $org->id, 'user_id' => $staff->id, 'classroom_id' => $sunshine->id, 'title' => 'Assistant Teacher', 'hired_on' => now()->subMonths(8)->toDateString()]);

            $device = Device::create(['organization_id' => $org->id, 'classroom_id' => $blue->id, 'name' => 'Blue Room Kiosk', 'type' => 'tablet', 'identifier' => 'LLD-BLUE-KIOSK-01', 'status' => 'active']);

            $child1 = Child::create(['organization_id' => $org->id, 'classroom_id' => $blue->id, 'child_code' => 'LLD01-CH-0001', 'first_name' => 'Ayan', 'last_name' => 'Hassan', 'date_of_birth' => now()->subYears(4)->subMonths(2)->toDateString(), 'allergies' => ['Peanuts']]);
            $child2 = Child::create(['organization_id' => $org->id, 'classroom_id' => $sunshine->id, 'child_code' => 'LLD01-CH-0002', 'first_name' => 'Samira', 'last_name' => 'Hassan', 'date_of_birth' => now()->subYears(2)->subMonths(8)->toDateString(), 'allergies' => []]);
            $child3 = Child::create(['organization_id' => $org->id, 'classroom_id' => $toddlers->id, 'child_code' => 'LLD01-CH-0003', 'first_name' => 'Muna', 'last_name' => 'Ali', 'date_of_birth' => now()->subYears(3)->subMonths(1)->toDateString(), 'allergies' => ['Dairy']]);

            $guardian = Guardian::create(['organization_id' => $org->id, 'user_id' => $parent->id, 'name' => 'Amina Hassan', 'email' => $parent->email, 'phone' => '+1 612 555 0199', 'relationship' => 'Mother', 'can_pickup' => true, 'status' => 'active', 'pin_hash' => Hash::make('123456')]);
            $backup = Guardian::create(['organization_id' => $org->id, 'user_id' => $omar->id, 'name' => 'Omar Yusuf', 'email' => 'omar@example.test', 'phone' => '+1 612 555 0166', 'relationship' => 'Uncle', 'can_pickup' => true, 'status' => 'active', 'pin_hash' => Hash::make('123456')]);
            $child1->guardians()->attach($guardian->id, ['primary_contact' => true, 'pickup_authorized' => true]);
            $child1->guardians()->attach($backup->id, ['primary_contact' => false, 'pickup_authorized' => true]);
            $child2->guardians()->attach($guardian->id, ['primary_contact' => true, 'pickup_authorized' => true]);
            $child3->guardians()->attach($backup->id, ['primary_contact' => true, 'pickup_authorized' => true]);

            DB::table('emergency_contacts')->insert([
                ['child_id' => $child1->id, 'name' => 'Omar Yusuf', 'phone' => '+1 612 555 0166', 'relationship' => 'Uncle', 'created_at' => now(), 'updated_at' => now()],
                ['child_id' => $child2->id, 'name' => 'Omar Yusuf', 'phone' => '+1 612 555 0166', 'relationship' => 'Uncle', 'created_at' => now(), 'updated_at' => now()],
                ['child_id' => $child3->id, 'name' => 'Amina Hassan', 'phone' => '+1 612 555 0199', 'relationship' => 'Family friend', 'created_at' => now(), 'updated_at' => now()],
            ]);

            DB::table('pickup_authorizations')->insert([
                ['child_id' => $child1->id, 'guardian_id' => $backup->id, 'authorized_name' => 'Omar Yusuf', 'phone' => '+1 612 555 0166', 'active' => true, 'expires_on' => now()->addYear()->toDateString(), 'created_at' => now(), 'updated_at' => now()],
            ]);

            $demoCheckIn = now('Africa/Nairobi')->setTime(8, 12);
            $attendance = AttendanceRecord::create([
                'child_id' => $child1->id,
                'organization_id' => $org->id,
                'classroom_id' => $blue->id,
                'date' => $demoCheckIn->toDateString(),
                'check_in_time' => $demoCheckIn->copy()->utc(),
                'signer_name' => $guardian->name,
                'signer_type' => 'guardian',
                'verification_method' => 'pin',
                'device_id' => $device->id,
                'check_in_signed_by_user_id' => $parent->id,
                'latitude' => -1.2921000,
                'longitude' => 36.8219000,
                'distance_meters' => 0,
                'location_flagged' => false,
                'check_in_latitude' => -1.2921000,
                'check_in_longitude' => 36.8219000,
                'check_in_distance_meters' => 0,
                'location_verified' => true,
            ]);
            AttendanceAuditLog::create(['attendance_record_id' => $attendance->id, 'action' => 'check_in', 'corrected_value' => $attendance->toArray(), 'reason' => 'Demo check-in', 'edited_by_user_id' => $parent->id, 'edited_at' => now()]);
            $absence = AbsenceRecord::create([
                'organization_id' => $org->id,
                'child_id' => $child2->id,
                'classroom_id' => $sunshine->id,
                'absence_date' => now()->subDay()->toDateString(),
                'absence_type' => 'sick',
                'reason' => 'Parent reported fever',
                'notes' => 'Demo absence record for parent and staff absence history.',
                'status' => 'recorded',
                'entered_by' => $staff->id,
            ]);

            $invoice1 = Invoice::create(['organization_id' => $org->id, 'child_id' => $child1->id, 'guardian_id' => $guardian->id, 'invoice_number' => 'INV-DEMO-1001', 'amount' => 850, 'due_date' => now()->addDays(10)->toDateString(), 'status' => 'open']);
            InvoiceItem::create(['invoice_id' => $invoice1->id, 'description' => 'May tuition', 'quantity' => 1, 'unit_price' => 850, 'total' => 850]);
            $invoice2 = Invoice::create(['organization_id' => $org->id, 'child_id' => $child2->id, 'guardian_id' => $guardian->id, 'invoice_number' => 'INV-DEMO-1002', 'amount' => 790, 'due_date' => now()->subDays(2)->toDateString(), 'status' => 'paid']);
            $payment = Payment::create(['invoice_id' => $invoice2->id, 'amount' => 790, 'method' => 'card', 'status' => 'paid', 'stripe_payment_intent_id' => 'pi_placeholder_demo', 'paid_at' => now()->subDays(3)]);
            DB::table('receipts')->insert(['payment_id' => $payment->id, 'receipt_number' => 'RCT-DEMO-1002', 'download_url' => 'placeholder://receipt/1002', 'created_at' => now(), 'updated_at' => now()]);

            IncidentReport::create(['organization_id' => $org->id, 'child_id' => $child1->id, 'classroom_id' => $blue->id, 'staff_user_id' => $teacher->id, 'severity' => 'medium', 'status' => 'sent', 'summary' => 'Minor playground scrape cleaned and monitored.', 'occurred_at' => now()->subHours(6)]);
            DB::table('daily_child_notes')->insert([
                ['organization_id' => $org->id, 'child_id' => $child1->id, 'staff_user_id' => $teacher->id, 'date' => now()->toDateString(), 'note' => 'Ayan ate lunch well and rested after story circle.', 'created_at' => now(), 'updated_at' => now()],
                ['organization_id' => $org->id, 'child_id' => $child2->id, 'staff_user_id' => $staff->id, 'date' => now()->toDateString(), 'note' => 'Samira enjoyed sensory play and practiced counting blocks.', 'created_at' => now(), 'updated_at' => now()],
            ]);

            $conversation = Conversation::create(['organization_id' => $org->id, 'subject' => 'Ayan daily update']);
            Message::create(['conversation_id' => $conversation->id, 'sender_id' => $teacher->id, 'body' => 'Ayan had a good morning in Blue Room.']);
            Message::create(['conversation_id' => $conversation->id, 'sender_id' => $parent->id, 'body' => 'Thank you for the update.']);
            Notification::create(['user_id' => $parent->id, 'organization_id' => $org->id, 'recipient_role' => 'parent', 'title' => 'Ayan checked in', 'body' => 'Ayan was checked in at 08:12.', 'type' => 'child_checked_in', 'related_model_type' => AttendanceRecord::class, 'related_model_id' => $attendance->id, 'delivered_at' => now(), 'delivery_channel' => 'in_app', 'delivery_status' => 'delivered', 'priority' => 'normal', 'created_by' => $teacher->id]);
            Notification::create(['user_id' => $parent->id, 'organization_id' => $org->id, 'recipient_role' => 'parent', 'title' => 'Samira marked absent', 'body' => 'Samira Hassan was marked absent yesterday (sick).', 'type' => 'absence_recorded', 'related_model_type' => AbsenceRecord::class, 'related_model_id' => $absence->id, 'delivered_at' => now(), 'delivery_channel' => 'in_app', 'delivery_status' => 'delivered', 'priority' => 'normal', 'created_by' => $staff->id]);
            Notification::create(['organization_id' => $org->id, 'title' => 'Invoice reminder', 'body' => 'INV-DEMO-1001 is due soon.', 'type' => 'invoice_created', 'related_model_type' => Invoice::class, 'related_model_id' => $invoice1->id, 'delivered_at' => now(), 'delivery_channel' => 'in_app', 'delivery_status' => 'delivered', 'priority' => 'normal', 'created_by' => $admin->id]);

            $platformPaid = PlatformInvoice::create([
                'organization_id' => $org->id,
                'subscription_id' => $subscription->id,
                'invoice_number' => 'PLAT-DEMO-1001',
                'billing_period_start' => now()->subMonth()->startOfMonth()->toDateString(),
                'billing_period_end' => now()->subMonth()->endOfMonth()->toDateString(),
                'due_date' => now()->subMonth()->addDays(14)->toDateString(),
                'currency' => 'USD',
                'subtotal' => 349,
                'total_amount' => 349,
                'amount_paid' => 349,
                'balance_due' => 0,
                'status' => 'paid',
                'payment_method' => 'bank_transfer',
                'paid_at' => now()->subDays(20),
                'notes' => 'Paid platform subscription invoice.',
            ]);
            PlatformPayment::create([
                'organization_id' => $org->id,
                'invoice_id' => $platformPaid->id,
                'amount' => 349,
                'currency' => 'USD',
                'method' => 'bank_transfer',
                'reference' => 'DEMO-BANK-349',
                'paid_at' => now()->subDays(20),
                'recorded_by' => $super->id,
                'notes' => 'Demo manual platform payment.',
            ]);
            PlatformInvoice::create([
                'organization_id' => $org->id,
                'subscription_id' => $subscription->id,
                'invoice_number' => 'PLAT-DEMO-1002',
                'billing_period_start' => now()->startOfMonth()->toDateString(),
                'billing_period_end' => now()->endOfMonth()->toDateString(),
                'due_date' => now()->addDays(10)->toDateString(),
                'currency' => 'USD',
                'subtotal' => 349,
                'total_amount' => 349,
                'balance_due' => 349,
                'status' => 'open',
                'payment_method' => 'manual',
                'notes' => 'Open platform invoice for the current billing period.',
            ]);
            PlatformInvoice::create([
                'organization_id' => $org->id,
                'subscription_id' => $subscription->id,
                'invoice_number' => 'PLAT-DEMO-1003',
                'billing_period_start' => now()->subMonths(2)->startOfMonth()->toDateString(),
                'billing_period_end' => now()->subMonths(2)->endOfMonth()->toDateString(),
                'due_date' => now()->subDays(15)->toDateString(),
                'currency' => 'USD',
                'subtotal' => 349,
                'total_amount' => 349,
                'balance_due' => 349,
                'status' => 'overdue',
                'payment_method' => 'manual',
                'notes' => 'Overdue platform invoice for demo warning states.',
            ]);

            $documentPath = 'documents/'.$org->id.'/demo-immunization-form.txt';
            Storage::disk('local')->put($documentPath, "Demo immunization form for {$child1->first_name} {$child1->last_name}.\nUploaded for Barbaari client-pilot document storage testing.\n");
            $document = Document::create([
                'organization_id' => $org->id,
                'child_id' => $child1->id,
                'uploaded_by' => $admin->id,
                'title' => 'Immunization form',
                'type' => 'health',
                'path' => $documentPath,
                'disk' => 'local',
                'original_name' => 'demo-immunization-form.txt',
                'mime_type' => 'text/plain',
                'size' => Storage::disk('local')->size($documentPath),
            ]);
            DB::table('child_documents')->insert(['child_id' => $child1->id, 'document_id' => $document->id, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('stripe_payment_logs')->insert(['organization_id' => $org->id, 'event_type' => 'payment_intent.succeeded', 'stripe_event_id' => 'evt_placeholder_demo', 'payload' => json_encode(['invoice' => 'INV-DEMO-1002']), 'created_at' => now(), 'updated_at' => now()]);

            SupportTicket::create(['organization_id' => $org->id, 'opened_by' => $admin->id, 'subject' => 'Need help with kiosk device', 'status' => 'open', 'priority' => 'normal', 'description' => 'Blue Room tablet needs QR mode enabled.']);
            AuditLog::create(['organization_id' => $org->id, 'actor_id' => $super->id, 'action' => 'demo.reset', 'target_type' => Organization::class, 'target_id' => $org->id, 'changes' => ['status' => 'active'], 'ip_address' => '127.0.0.1']);
            PlatformSetting::updateOrCreate(['key' => 'feature_flags'], ['value' => ['qr_kiosk' => true, 'stripe_payments' => false]]);
            SystemAlert::updateOrCreate(['title' => 'Local development mode'], ['body' => 'Stripe, OTP, receipts, document downloads, and monitoring providers are demo placeholders.', 'severity' => 'info', 'type' => 'general', 'resolved_at' => null]);
        });

        $this->info('Barbaari demo data reset. Little Lantern Daycare is active.');
        $this->table(['Account', 'Password'], [
            ['super@barbaari.test', 'Password123!'],
            ['admin@littlelantern.test', 'Password123!'],
            ['manager@littlelantern.test', 'Password123!'],
            ['teacher@littlelantern.test', 'Password123!'],
            ['staff@littlelantern.test', 'Password123!'],
            ['parent@littlelantern.test', 'Password123!'],
            ['omar@example.test', 'Password123!'],
        ]);

        return self::SUCCESS;
    }

    private function clearTenantData(Organization $org): void
    {
        $childIds = Child::where('organization_id', $org->id)->pluck('id');
        $invoiceIds = Invoice::where('organization_id', $org->id)->pluck('id');
        $paymentIds = Payment::whereIn('invoice_id', $invoiceIds)->pluck('id');
        $platformInvoiceIds = PlatformInvoice::where('organization_id', $org->id)->pluck('id');
        $conversationIds = Conversation::where('organization_id', $org->id)->pluck('id');
        $ticketIds = SupportTicket::where('organization_id', $org->id)->pluck('id');
        $documentIds = Document::where('organization_id', $org->id)->pluck('id');
        $userIds = User::where('organization_id', $org->id)->pluck('id');
        $attendanceIds = AttendanceRecord::where('organization_id', $org->id)->pluck('id');

        AttendanceAuditLog::whereIn('attendance_record_id', $attendanceIds)->delete();
        DB::table('attendance_corrections')->whereIn('attendance_record_id', $attendanceIds)->delete();
        AttendanceRecord::where('organization_id', $org->id)->delete();
        AbsenceRecord::where('organization_id', $org->id)->delete();
        DB::table('receipts')->whereIn('payment_id', $paymentIds)->delete();
        Payment::whereIn('invoice_id', $invoiceIds)->delete();
        InvoiceItem::whereIn('invoice_id', $invoiceIds)->delete();
        Invoice::where('organization_id', $org->id)->delete();
        PlatformPayment::whereIn('invoice_id', $platformInvoiceIds)->delete();
        PlatformInvoice::where('organization_id', $org->id)->delete();
        IncidentReport::where('organization_id', $org->id)->delete();
        DB::table('daily_child_notes')->where('organization_id', $org->id)->delete();
        DB::table('child_documents')->whereIn('document_id', $documentIds)->orWhereIn('child_id', $childIds)->delete();
        Document::where('organization_id', $org->id)->delete();
        Storage::disk('local')->deleteDirectory('documents/'.$org->id);
        DB::table('emergency_contacts')->whereIn('child_id', $childIds)->delete();
        DB::table('pickup_authorizations')->whereIn('child_id', $childIds)->delete();
        DB::table('child_guardians')->whereIn('child_id', $childIds)->delete();
        Guardian::where('organization_id', $org->id)->delete();
        Child::where('organization_id', $org->id)->delete();
        StaffProfile::where('organization_id', $org->id)->delete();
        DB::table('staff_check_ins')->where('organization_id', $org->id)->delete();
        DB::table('staff_activity_logs')->where('organization_id', $org->id)->delete();
        Device::where('organization_id', $org->id)->delete();
        Classroom::where('organization_id', $org->id)->delete();
        Message::whereIn('conversation_id', $conversationIds)->delete();
        Conversation::where('organization_id', $org->id)->delete();
        Notification::where('organization_id', $org->id)->orWhereIn('user_id', $userIds)->delete();
        DB::table('pin_verification_logs')->where('organization_id', $org->id)->orWhereIn('user_id', $userIds)->delete();
        SupportTicketComment::whereIn('support_ticket_id', $ticketIds)->delete();
        SupportTicket::where('organization_id', $org->id)->delete();
        OrganizationInvitation::where('organization_id', $org->id)->delete();
        AuditLog::where('organization_id', $org->id)->delete();
        DB::table('stripe_payment_logs')->where('organization_id', $org->id)->delete();
        PaymentProviderEvent::where('provider', 'stripe')->where('event_id', 'like', 'demo_%')->delete();

        User::where('organization_id', $org->id)
            ->whereNotIn('email', ['admin@littlelantern.test', 'manager@littlelantern.test', 'teacher@littlelantern.test', 'staff@littlelantern.test', 'parent@littlelantern.test', 'omar@example.test'])
            ->delete();
    }

    private function clearStrayDemoOrganizations(): void
    {
        Organization::query()
            ->where('name', 'API Test Org')
            ->orWhere('name', 'human test')
            ->orWhere('name', 'Demo Rehearsal Org')
            ->orWhere('license_number', 'API-TEST')
            ->get()
            ->each(function (Organization $organization) {
                if ($organization->name === 'Little Lantern Daycare') {
                    return;
                }

                $this->clearTenantData($organization);
                OrganizationSetting::where('organization_id', $organization->id)->delete();
                Subscription::where('organization_id', $organization->id)->delete();
                AuditLog::where('organization_id', $organization->id)->delete();
                $organization->delete();
            });
    }

    private function demoUser(string $name, string $email, string $role, ?int $organizationId, $roleModels, ?string $pin = null): User
    {
        $user = User::updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'role' => $role,
                'status' => 'active',
                'organization_id' => $organizationId,
                'password' => Hash::make('Password123!'),
                'pin' => null,
                'pin_hash' => $pin ? Hash::make($pin) : null,
                'pin_failed_attempts' => 0,
                'pin_locked_until' => null,
            ]
        );
        $user->forceFill(['email_verified_at' => now()])->save();
        $user->roles()->sync([$roleModels[$role]->id]);

        return $user;
    }
}
