<?php

namespace Tests\Feature;

use App\Models\AttendanceAuditLog;
use App\Models\AttendanceRecord;
use App\Models\Child;
use App\Models\Organization;
use App\Models\PinVerificationLog;
use App\Models\PricingPlan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regression coverage for the production-resilience audit's attendance/billing fixes:
 * double-tap/retry safety on check-in, check-out, staff self check-in, and payment
 * recording — none of these must silently duplicate a custody record, a payment, or a
 * notification when the same request arrives twice.
 */
class AttendanceResilienceTest extends TestCase
{
    use RefreshDatabase;

    public function test_checking_out_an_already_checked_out_child_returns_409_and_preserves_the_original_record(): void
    {
        [, $admin, $child] = $this->fixture();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/attendance/check-in', $this->payload($child))
            ->assertCreated();

        $first = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/attendance/check-out', $this->payload($child))
            ->assertOk();
        $originalCheckoutTime = $first->json('attendance.checkOutTime');

        // Simulate a double-tap / retry a moment later.
        $this->travel(2)->minutes();
        $second = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/attendance/check-out', $this->payload($child))
            ->assertStatus(409);

        $this->assertSame('This child is already checked out.', $second->json('message'));
        $this->assertSame($originalCheckoutTime, $second->json('attendance.checkOutTime'));
        $this->assertSame(1, AttendanceRecord::where('child_id', $child->id)->count());
    }

    public function test_repeat_check_in_is_a_no_op_that_does_not_duplicate_the_record_or_the_audit_trail(): void
    {
        [, $admin, $child] = $this->fixture();

        $first = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/attendance/check-in', $this->payload($child))
            ->assertCreated();
        $originalCheckInTime = $first->json('attendance.checkInTime');

        $this->travel(2)->minutes();
        $second = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/attendance/check-in', $this->payload($child))
            ->assertOk(); // 200, not 201 — this was not a new check-in

        $this->assertSame($originalCheckInTime, $second->json('attendance.checkInTime'));
        $this->assertSame(1, AttendanceRecord::where('child_id', $child->id)->count());
        // Only one "check_in" audit entry should exist — a retry must not write a second
        // misleading "Initial check-in" entry.
        $this->assertSame(1, AttendanceAuditLog::where('action', 'check_in')->count());
    }

    public function test_staff_double_tapping_their_own_check_in_does_not_open_a_second_shift(): void
    {
        [, $admin] = $this->fixture();

        $this->actingAs($admin, 'sanctum')->postJson('/api/staff/check-in')->assertCreated();
        $this->actingAs($admin, 'sanctum')->postJson('/api/staff/check-in')->assertOk();

        $this->assertSame(
            1,
            DB::table('staff_check_ins')->where('user_id', $admin->id)->whereNull('check_out_time')->count()
        );
    }

    public function test_recording_a_payment_twice_for_the_same_invoice_is_rejected(): void
    {
        [$organization, $admin] = $this->fixture();
        $invoice = \App\Models\Invoice::create([
            'organization_id' => $organization->id,
            'invoice_number' => 'INV-RESILIENCE-1',
            'amount' => 100,
            'due_date' => now()->addWeek(),
            'status' => 'open',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/billing/invoices/{$invoice->id}/payments", ['amount' => 100, 'method' => 'cash'])
            ->assertOk();

        $second = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/billing/invoices/{$invoice->id}/payments", ['amount' => 100, 'method' => 'cash'])
            ->assertStatus(409);

        $this->assertSame('This invoice is already paid.', $second->json('message'));
        $this->assertSame(1, DB::table('payments')->where('invoice_id', $invoice->id)->count());
        $this->assertSame(1, DB::table('receipts')->count());
    }

    public function test_approving_the_same_registration_application_twice_does_not_create_two_organizations(): void
    {
        $plan = PricingPlan::create([
            'name' => 'Starter', 'code' => 'starter-resilience', 'monthly_price' => 49, 'yearly_price' => 490,
            'status' => 'active', 'featured' => false, 'available_for_family_child_care' => true, 'available_for_center_daycare' => true,
        ]);
        $owner = User::factory()->create(['organization_id' => null, 'role' => 'daycare_admin', 'status' => 'pending_approval']);
        $application = \App\Models\FacilityRegistrationApplication::create([
            'facility_type' => 'center_daycare',
            'business_name' => 'Resilience Test Daycare',
            'owner_name' => $owner->name,
            'owner_email' => $owner->email,
            'owner_user_id' => $owner->id,
            'phone' => '555-0100',
            'address_line1' => '1 Test St',
            'city' => 'Testville',
            'state' => 'WA',
            'postal_code' => '98101',
            'country' => 'US',
            'attendance_radius_meters' => 100,
            'pricing_plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
            'status' => 'pending',
        ]);
        $superAdmin = User::factory()->create(['role' => 'super_admin']);

        $this->actingAs($superAdmin, 'sanctum')
            ->postJson("/api/platform/registration-applications/{$application->id}/approve", ['pricing_plan_id' => $plan->id, 'billing_cycle' => 'monthly'])
            ->assertCreated();

        // A second "Approve" click (double-tap) on the now-approved application.
        $this->actingAs($superAdmin, 'sanctum')
            ->postJson("/api/platform/registration-applications/{$application->id}/approve", ['pricing_plan_id' => $plan->id, 'billing_cycle' => 'monthly'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'This application has already been approved.');

        $this->assertSame(1, Organization::where('name', 'Resilience Test Daycare')->count());
    }

    private function payload(Child $child): array
    {
        return [
            'child_id' => $child->id,
            'signer_type' => 'staff',
            'verification_method' => 'secure_login',
            'latitude' => 38.8977,
            'longitude' => -77.0365,
        ];
    }

    private function fixture(): array
    {
        $plan = PricingPlan::create([
            'name' => 'Starter',
            'code' => 'starter-resilience-'.uniqid(),
            'monthly_price' => 49,
            'yearly_price' => 490,
            'status' => 'active',
            'featured' => false,
            'available_for_family_child_care' => true,
            'available_for_center_daycare' => true,
        ]);
        $organization = Organization::create([
            'name' => 'Resilience Center',
            'organization_code' => 'RES'.random_int(10000, 99999),
            'facility_type' => 'center_daycare',
            'status' => 'active',
            'approved_at' => now(),
            'plan' => 'Starter',
            'latitude' => 38.8977,
            'longitude' => -77.0365,
            'attendance_radius_meters' => 100,
            'checkin_radius_meters' => 100,
        ]);
        Subscription::create([
            'organization_id' => $organization->id,
            'pricing_plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
            'status' => 'active',
            'provider' => 'manual',
        ]);
        $admin = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => 'daycare_admin',
            'status' => 'active',
        ]);
        $child = Child::create([
            'organization_id' => $organization->id,
            'first_name' => 'Resilience',
            'last_name' => 'Child',
            'status' => 'active',
        ]);

        return [$organization, $admin, $child];
    }
}
