<?php

namespace Database\Seeders;

use App\Models\AttendanceAuditLog;
use App\Models\AttendanceRecord;
use App\Models\AuditLog;
use App\Models\Child;
use App\Models\Classroom;
use App\Models\Conversation;
use App\Models\Device;
use App\Models\Document;
use App\Models\Guardian;
use App\Models\IncidentReport;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Message;
use App\Models\Notification;
use App\Models\Organization;
use App\Models\OrganizationSetting;
use App\Models\Payment;
use App\Models\PlatformSetting;
use App\Models\PricingPlan;
use App\Models\Role;
use App\Models\StaffProfile;
use App\Models\Subscription;
use App\Models\SupportTicket;
use App\Models\SystemAlert;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $roles = collect([
            'super_admin' => 'Super Admin',
            'daycare_admin' => 'Daycare Admin',
            'manager' => 'Manager',
            'staff' => 'Staff',
            'teacher' => 'Teacher',
            'parent' => 'Parent',
            'billing_manager' => 'Billing Manager',
            'support_staff' => 'Support Staff',
        ])->map(fn ($label, $name) => Role::create(['name' => $name, 'label' => $label]));

        $plan = PricingPlan::create([
            'name' => 'Growth',
            'monthly_price' => 349,
            'child_limit' => 150,
            'features' => ['attendance', 'billing', 'messages', 'incident_reports'],
        ]);

        $org = Organization::create([
            'name' => 'Little Lantern Daycare',
            'status' => 'active',
            'license_number' => 'LLD-2026-001',
            'city' => 'Minneapolis',
            'state' => 'MN',
            'phone' => '+1 612 555 0100',
            'email' => 'hello@littlelantern.test',
            'plan' => 'Growth',
            'mrr' => 349,
            'approved_at' => now()->subMonths(3),
        ]);

        OrganizationSetting::create([
            'organization_id' => $org->id,
            'attendance_policy' => ['late_after' => '09:30', 'require_checkout_signature' => true, 'future_prefill_allowed' => false, 'attendance_timezone' => 'Africa/Nairobi'],
            'billing_settings' => ['currency' => 'USD', 'invoice_day' => 1],
            'notification_settings' => ['email' => true, 'sms' => false],
        ]);

        Subscription::create([
            'organization_id' => $org->id,
            'pricing_plan_id' => $plan->id,
            'status' => 'active',
            'current_period_ends_at' => now()->addMonth(),
            'stripe_subscription_id' => 'sub_placeholder_growth',
        ]);

        $super = $this->user('Super Admin', 'super@barbaari.test', 'super_admin');
        $support = $this->user('Support Staff', 'support@barbaari.test', 'support_staff');
        $admin = $this->user('Daycare Admin', 'admin@littlelantern.test', 'daycare_admin', $org->id, '123456');
        $manager = $this->user('Daycare Manager', 'manager@littlelantern.test', 'manager', $org->id, '123456');
        $teacher = $this->user('Blue Room Teacher', 'teacher@littlelantern.test', 'teacher', $org->id, '123456');
        $staff = $this->user('Staff Assistant', 'staff@littlelantern.test', 'staff', $org->id, '123456');
        $parent = $this->user('Amina Hassan', 'parent@littlelantern.test', 'parent', $org->id);
        $omar = $this->user('Omar Yusuf', 'omar@example.test', 'parent', $org->id);
        $billing = $this->user('Billing Manager', 'billing@littlelantern.test', 'billing_manager', $org->id);

        foreach (compact('super', 'support', 'admin', 'manager', 'teacher', 'staff', 'parent', 'omar', 'billing') as $user) {
            $user->roles()->attach($roles[$user->role]->id);
        }

        $blue = Classroom::create(['organization_id' => $org->id, 'name' => 'Blue Room', 'capacity' => 18, 'lead_staff_id' => $teacher->id]);
        $sunshine = Classroom::create(['organization_id' => $org->id, 'name' => 'Sunshine', 'capacity' => 22, 'lead_staff_id' => $staff->id]);

        StaffProfile::create(['organization_id' => $org->id, 'user_id' => $manager->id, 'classroom_id' => null, 'title' => 'Daycare Manager', 'hired_on' => now()->subYear()->toDateString()]);
        StaffProfile::create(['organization_id' => $org->id, 'user_id' => $teacher->id, 'classroom_id' => $blue->id, 'title' => 'Lead Teacher', 'hired_on' => now()->subYear()->toDateString()]);
        StaffProfile::create(['organization_id' => $org->id, 'user_id' => $staff->id, 'classroom_id' => $sunshine->id, 'title' => 'Assistant Teacher', 'hired_on' => now()->subMonths(8)->toDateString()]);

        $device = Device::create(['organization_id' => $org->id, 'classroom_id' => $blue->id, 'name' => 'Blue Room Kiosk', 'type' => 'tablet', 'identifier' => 'LLD-BLUE-KIOSK-01']);

        $child1 = Child::create(['organization_id' => $org->id, 'classroom_id' => $blue->id, 'child_code' => 'LLD-CH-0001', 'first_name' => 'Ayan', 'last_name' => 'Hassan', 'date_of_birth' => now()->subYears(4)->subMonths(2)->toDateString(), 'allergies' => ['Peanuts']]);
        $child2 = Child::create(['organization_id' => $org->id, 'classroom_id' => $sunshine->id, 'child_code' => 'LLD-CH-0002', 'first_name' => 'Samira', 'last_name' => 'Hassan', 'date_of_birth' => now()->subYears(2)->subMonths(8)->toDateString(), 'allergies' => []]);

        $guardian = Guardian::create(['organization_id' => $org->id, 'user_id' => $parent->id, 'name' => 'Amina Hassan', 'email' => $parent->email, 'phone' => '+1 612 555 0199', 'relationship' => 'Mother', 'can_pickup' => true]);
        $backup = Guardian::create(['organization_id' => $org->id, 'user_id' => $omar->id, 'name' => 'Omar Yusuf', 'email' => 'omar@example.test', 'phone' => '+1 612 555 0166', 'relationship' => 'Uncle', 'can_pickup' => true]);
        $child1->guardians()->attach($guardian->id, ['primary_contact' => true, 'pickup_authorized' => true]);
        $child1->guardians()->attach($backup->id, ['primary_contact' => false, 'pickup_authorized' => true]);
        $child2->guardians()->attach($guardian->id, ['primary_contact' => true, 'pickup_authorized' => true]);

        DB::table('emergency_contacts')->insert([
            ['child_id' => $child1->id, 'name' => 'Omar Yusuf', 'phone' => '+1 612 555 0166', 'relationship' => 'Uncle', 'created_at' => now(), 'updated_at' => now()],
            ['child_id' => $child2->id, 'name' => 'Omar Yusuf', 'phone' => '+1 612 555 0166', 'relationship' => 'Uncle', 'created_at' => now(), 'updated_at' => now()],
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
        ]);
        AttendanceAuditLog::create(['attendance_record_id' => $attendance->id, 'action' => 'check_in', 'corrected_value' => $attendance->toArray(), 'reason' => 'Seed check-in', 'edited_by_user_id' => $parent->id, 'edited_at' => now()]);

        $invoice1 = Invoice::create(['organization_id' => $org->id, 'child_id' => $child1->id, 'guardian_id' => $guardian->id, 'invoice_number' => 'INV-1001', 'amount' => 850, 'due_date' => now()->addDays(10)->toDateString(), 'status' => 'open']);
        InvoiceItem::create(['invoice_id' => $invoice1->id, 'description' => 'May tuition', 'quantity' => 1, 'unit_price' => 850, 'total' => 850]);
        $invoice2 = Invoice::create(['organization_id' => $org->id, 'child_id' => $child2->id, 'guardian_id' => $guardian->id, 'invoice_number' => 'INV-1002', 'amount' => 790, 'due_date' => now()->subDays(2)->toDateString(), 'status' => 'paid']);
        $payment = Payment::create(['invoice_id' => $invoice2->id, 'amount' => 790, 'method' => 'card', 'status' => 'paid', 'stripe_payment_intent_id' => 'pi_placeholder', 'paid_at' => now()->subDays(3)]);
        DB::table('receipts')->insert(['payment_id' => $payment->id, 'receipt_number' => 'RCT-1002', 'download_url' => 'placeholder://receipt/1002', 'created_at' => now(), 'updated_at' => now()]);

        IncidentReport::create(['organization_id' => $org->id, 'child_id' => $child1->id, 'classroom_id' => $blue->id, 'staff_user_id' => $teacher->id, 'severity' => 'medium', 'status' => 'sent', 'summary' => 'Minor playground scrape cleaned and monitored.', 'occurred_at' => now()->subHours(6)]);
        DB::table('daily_child_notes')->insert(['organization_id' => $org->id, 'child_id' => $child1->id, 'staff_user_id' => $teacher->id, 'date' => now()->toDateString(), 'note' => 'Ayan ate lunch well and rested after story circle.', 'created_at' => now(), 'updated_at' => now()]);

        $conversation = Conversation::create(['organization_id' => $org->id, 'subject' => 'Ayan daily update']);
        Message::create(['conversation_id' => $conversation->id, 'sender_id' => $teacher->id, 'body' => 'Ayan had a good morning in Blue Room.']);
        Message::create(['conversation_id' => $conversation->id, 'sender_id' => $parent->id, 'body' => 'Thank you for the update.']);
        Notification::create(['user_id' => $parent->id, 'organization_id' => $org->id, 'title' => 'Ayan checked in', 'body' => 'Ayan was checked in at 08:12.', 'type' => 'attendance']);
        Notification::create(['organization_id' => $org->id, 'title' => 'Invoice reminder', 'body' => 'INV-1001 is due soon.', 'type' => 'billing']);

        $document = Document::create(['organization_id' => $org->id, 'child_id' => $child1->id, 'uploaded_by' => $admin->id, 'title' => 'Immunization form', 'type' => 'health', 'path' => 'placeholder://documents/immunization-form']);
        DB::table('child_documents')->insert(['child_id' => $child1->id, 'document_id' => $document->id, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('stripe_payment_logs')->insert(['organization_id' => $org->id, 'event_type' => 'payment_intent.succeeded', 'stripe_event_id' => 'evt_placeholder', 'payload' => json_encode(['invoice' => 'INV-1002']), 'created_at' => now(), 'updated_at' => now()]);

        SupportTicket::create(['organization_id' => $org->id, 'opened_by' => $admin->id, 'subject' => 'Need help with kiosk device', 'status' => 'open', 'priority' => 'normal', 'description' => 'Blue Room tablet needs QR mode enabled.']);
        AuditLog::create(['organization_id' => $org->id, 'actor_id' => $admin->id, 'action' => 'organization.seeded', 'target_type' => Organization::class, 'target_id' => $org->id, 'changes' => ['seed' => true], 'ip_address' => '127.0.0.1']);
        PlatformSetting::create(['key' => 'feature_flags', 'value' => ['qr_kiosk' => true, 'stripe_payments' => false]]);
        SystemAlert::create(['title' => 'Local development mode', 'body' => 'Stripe and document downloads are placeholders.', 'severity' => 'info']);
    }

    private function user(string $name, string $email, string $role, ?int $organizationId = null, ?string $pin = null): User
    {
        return User::create([
            'name' => $name,
            'email' => $email,
            'role' => $role,
            'organization_id' => $organizationId,
            'password' => Hash::make('Password123!'),
            'pin' => null,
            'pin_hash' => $pin ? Hash::make($pin) : null,
            'pin_failed_attempts' => 0,
            'pin_locked_until' => null,
            'email_verified_at' => now(),
        ]);
    }
}
