<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\AuditLog;
use App\Models\Child;
use App\Models\Guardian;
use App\Models\Organization;
use App\Models\PinVerificationLog;
use App\Models\PricingPlan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TabletAttendanceGeofenceEnforcementTest extends TestCase
{
    use RefreshDatabase;

    public function test_check_in_inside_radius_saves(): void
    {
        [$organization, $admin, $child] = $this->fixture();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/attendance/guardian-check-in', $this->attendancePayload($child, $admin, $this->pinLog($admin), 38.8977, -77.0365))
            ->assertCreated()
            ->assertJsonPath('attendance.locationVerified', true)
            ->assertJsonPath('attendance.distanceMeters', 0);

        $this->assertSame(1, AttendanceRecord::where('organization_id', $organization->id)->count());
    }

    public function test_check_in_outside_radius_is_blocked(): void
    {
        [, $admin, $child] = $this->fixture();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/attendance/guardian-check-in', $this->attendancePayload($child, $admin, $this->pinLog($admin), 38.9077, -77.0465))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['location'])
            ->assertSee('You are outside the allowed attendance location radius.');

        $this->assertSame(0, AttendanceRecord::count());
    }

    public function test_check_out_inside_radius_saves(): void
    {
        [, $admin, $child] = $this->fixture();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/attendance/guardian-check-in', $this->attendancePayload($child, $admin, $this->pinLog($admin), 38.8977, -77.0365))
            ->assertCreated();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/attendance/guardian-check-out', $this->attendancePayload($child, $admin, $this->pinLog($admin), 38.8977, -77.0365))
            ->assertOk()
            ->assertJsonPath('attendance.locationVerified', true);
    }

    public function test_check_out_outside_radius_is_blocked(): void
    {
        [, $admin, $child] = $this->fixture();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/attendance/guardian-check-in', $this->attendancePayload($child, $admin, $this->pinLog($admin), 38.8977, -77.0365))
            ->assertCreated();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/attendance/guardian-check-out', $this->attendancePayload($child, $admin, $this->pinLog($admin), 38.9077, -77.0465))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['location'])
            ->assertSee('You are outside the allowed attendance location radius.');

        $this->assertNull(AttendanceRecord::firstOrFail()->check_out_time);
    }

    public function test_absence_inside_radius_saves_with_location_audit_metadata(): void
    {
        [, $admin, $child] = $this->fixture();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/absence-records', $this->absencePayload($child, $admin, $this->pinLog($admin), 38.8977, -77.0365))
            ->assertCreated();

        $changes = AuditLog::where('action', 'absence.created')->firstOrFail()->changes;
        $this->assertSame(38.8977, $changes['latitude']);
        $this->assertSame(-77.0365, $changes['longitude']);
        $this->assertSame(0, $changes['distance_meters']);
        $this->assertTrue($changes['location_verified']);
    }

    public function test_absence_outside_radius_is_blocked(): void
    {
        [, $admin, $child] = $this->fixture();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/absence-records', $this->absencePayload($child, $admin, $this->pinLog($admin), 38.9077, -77.0465))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['location'])
            ->assertSee('You are outside the allowed attendance location radius.');
    }

    public function test_missing_device_location_is_blocked(): void
    {
        [, $admin, $child] = $this->fixture();

        $payload = $this->attendancePayload($child, $admin, $this->pinLog($admin), 38.8977, -77.0365);
        unset($payload['latitude'], $payload['longitude']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/attendance/guardian-check-in', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['location'])
            ->assertSee('Device location is required for attendance.');
    }

    public function test_missing_organization_location_is_blocked(): void
    {
        [$organization, $admin, $child] = $this->fixture();
        $organization->update(['latitude' => null, 'longitude' => null]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/attendance/guardian-check-in', $this->attendancePayload($child, $admin, $this->pinLog($admin), 38.8977, -77.0365))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['location'])
            ->assertSee('Attendance location is not configured. Please update it in Settings.');
    }

    public function test_staff_admin_owner_signer_flow_still_works(): void
    {
        [, $admin, $child] = $this->fixture();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/attendance/guardian-check-in', $this->attendancePayload($child, $admin, $this->pinLog($admin), 38.8977, -77.0365))
            ->assertCreated()
            ->assertJsonPath('attendance.signerType', 'staff')
            ->assertJsonPath('attendance.locationVerified', true);
    }

    public function test_guardian_signer_pin_signature_flow_still_works(): void
    {
        [$organization, $admin, $child] = $this->fixture();
        $guardian = Guardian::create([
            'organization_id' => $organization->id,
            'name' => 'Guardian Signer',
            'status' => 'active',
            'can_pickup' => true,
            'pin_hash' => Hash::make('1234'),
        ]);
        $child->guardians()->attach($guardian->id, ['primary_contact' => true, 'pickup_authorized' => true]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/attendance/guardian-check-in', [
                'child_id' => $child->id,
                'signer_type' => 'guardian',
                'guardian_id' => $guardian->id,
                'signer_name' => $guardian->name,
                'verification_method' => 'pin',
                'pin_verification_id' => $this->pinLog($admin, 'tablet_signer:guardian:'.$guardian->id)->id,
                'signature_name' => $guardian->name,
                'signature_reference' => 'tablet-web-signature',
                'latitude' => 38.8977,
                'longitude' => -77.0365,
            ])
            ->assertCreated()
            ->assertJsonPath('attendance.signerType', 'guardian')
            ->assertJsonPath('attendance.locationVerified', true);
    }

    private function fixture(): array
    {
        $plan = PricingPlan::create([
            'name' => 'Starter',
            'code' => 'starter',
            'monthly_price' => 49,
            'yearly_price' => 490,
            'status' => 'active',
            'featured' => false,
            'available_for_family_child_care' => true,
            'available_for_center_daycare' => true,
        ]);
        $organization = Organization::create([
            'name' => 'Geofence Center',
            'organization_code' => 'GEO001',
            'facility_type' => 'family_child_care',
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
            'pin_hash' => Hash::make('1234'),
        ]);
        $child = Child::create([
            'organization_id' => $organization->id,
            'first_name' => 'Geo',
            'last_name' => 'Child',
            'status' => 'active',
        ]);

        return [$organization, $admin, $child];
    }

    private function pinLog(User $user, ?string $purpose = null): PinVerificationLog
    {
        return PinVerificationLog::create([
            'user_id' => $user->id,
            'organization_id' => $user->organization_id,
            'email' => $user->email,
            'success' => true,
            'purpose' => $purpose ?? 'tablet_signer:user:'.$user->id,
            'verified_at' => now(),
        ]);
    }

    private function attendancePayload(Child $child, User $admin, PinVerificationLog $pin, float $lat, float $lng): array
    {
        return [
            'child_id' => $child->id,
            'signer_type' => 'staff',
            'assisting_staff_id' => $admin->id,
            'signer_name' => $admin->name,
            'verification_method' => 'pin',
            'pin_verification_id' => $pin->id,
            'signature_name' => $admin->name,
            'signature_reference' => 'tablet-web-signature',
            'latitude' => $lat,
            'longitude' => $lng,
        ];
    }

    private function absencePayload(Child $child, User $admin, PinVerificationLog $pin, float $lat, float $lng): array
    {
        return [
            'child_id' => $child->id,
            'absence_date' => now()->toDateString(),
            'absence_type' => 'no_show',
            'reason' => 'Tablet absence',
            'signer_type' => 'staff',
            'assisting_staff_id' => $admin->id,
            'signer_name' => $admin->name,
            'verification_method' => 'pin',
            'pin_verification_id' => $pin->id,
            'signature_name' => $admin->name,
            'latitude' => $lat,
            'longitude' => $lng,
        ];
    }
}
