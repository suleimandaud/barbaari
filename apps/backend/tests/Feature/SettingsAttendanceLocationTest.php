<?php

namespace Tests\Feature;

use App\Models\Child;
use App\Models\Organization;
use App\Models\PricingPlan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\GeocodingService;
use App\Services\TimezoneLookupService;
use App\Services\USPSAddressService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsAttendanceLocationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->app->instance(USPSAddressService::class, new class extends USPSAddressService {
            public function validate(array $address): array
            {
                if ($address['address_line1'] === 'Invalid') {
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        'address' => ['We could not validate this address. Please check the street, city, state, and ZIP code.'],
                    ]);
                }

                return [
                    'address_line1' => '1600 PENNSYLVANIA AVE NW',
                    'address_line2' => null,
                    'city' => 'WASHINGTON',
                    'state' => 'DC',
                    'postal_code' => '20500',
                    'country' => 'US',
                    'standardized_address' => '1600 PENNSYLVANIA AVE NW, WASHINGTON, DC 20500',
                ];
            }
        });

        $this->app->instance(GeocodingService::class, new class extends GeocodingService {
            public function geocode(array $address): array
            {
                return [
                    'latitude' => 38.8977,
                    'longitude' => -77.0365,
                    'geocoding_provider' => 'nominatim',
                ];
            }
        });

        $this->app->instance(TimezoneLookupService::class, new class extends TimezoneLookupService {
            public function resolve(float $latitude, float $longitude): string
            {
                return 'America/New_York';
            }
        });
    }

    public function test_provider_admin_can_validate_and_update_attendance_location(): void
    {
        [$organization, $admin] = $this->activeOrganizationAndUser('daycare_admin');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location/validate', $this->locationPayload())
            ->assertOk()
            ->assertJsonPath('standardized_address', '1600 PENNSYLVANIA AVE NW, WASHINGTON, DC 20500')
            ->assertJsonPath('latitude', 38.8977)
            ->assertJsonPath('longitude', -77.0365)
            ->assertJsonPath('timezone', 'America/New_York')
            ->assertJsonPath('message', 'Address validated. This location will be used for tablet attendance geofence.');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location', $this->locationPayload())
            ->assertOk()
            ->assertJsonPath('organization.standardized_address', '1600 PENNSYLVANIA AVE NW, WASHINGTON, DC 20500')
            ->assertJsonPath('organization.latitude', 38.8977)
            ->assertJsonPath('organization.longitude', -77.0365)
            ->assertJsonPath('organization.timezone', 'America/New_York')
            ->assertJsonPath('timezone', 'America/New_York')
            ->assertJsonPath('organization.attendance_radius_meters', 150);

        $organization->refresh();
        $this->assertSame('1600 PENNSYLVANIA AVE NW, WASHINGTON, DC 20500', $organization->standardized_address);
        $this->assertSame('20500', $organization->postal_code);
        $this->assertSame('nominatim', $organization->geocoding_provider);
        $this->assertEquals(38.8977, (float) $organization->latitude);
        $this->assertEquals(-77.0365, (float) $organization->longitude);
        $this->assertSame('America/New_York', $organization->timezone);
        $this->assertSame(150, (int) $organization->attendance_radius_meters);
        $this->assertNotNull($organization->address_validated_at);
        $this->assertNotNull($organization->geocoded_at);
    }

    public function test_organization_profile_update_no_longer_accepts_manual_timezone(): void
    {
        [$organization, $admin] = $this->activeOrganizationAndUser('daycare_admin');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location', $this->locationPayload())
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/manager/organization', [
                'name' => 'Settings Center',
                'timezone' => 'Not/AValidTimezone',
            ])
            ->assertOk();

        $organization->refresh();
        $this->assertSame('America/New_York', $organization->timezone);
    }

    public function test_manager_can_update_attendance_location(): void
    {
        [, $manager] = $this->activeOrganizationAndUser('manager');

        $this->actingAs($manager, 'sanctum')
            ->postJson('/api/settings/attendance-location', $this->locationPayload())
            ->assertOk();
    }

    public function test_staff_cannot_update_attendance_location(): void
    {
        [, $staff] = $this->activeOrganizationAndUser('staff');

        $this->actingAs($staff, 'sanctum')
            ->postJson('/api/settings/attendance-location', $this->locationPayload())
            ->assertForbidden();
    }

    public function test_invalid_address_returns_friendly_error(): void
    {
        [, $admin] = $this->activeOrganizationAndUser('daycare_admin');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location/validate', [
                ...$this->locationPayload(),
                'address_line1' => 'Invalid',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['address'])
            ->assertSee('We could not validate this address. Please check the street, city, state, and ZIP code.');
    }

    public function test_tablet_geofence_uses_updated_coordinates(): void
    {
        [$organization, $admin] = $this->activeOrganizationAndUser('daycare_admin');
        $child = Child::create([
            'organization_id' => $organization->id,
            'first_name' => 'Test',
            'last_name' => 'Child',
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location', $this->locationPayload())
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/attendance/check-in', [
                'child_id' => $child->id,
                'signer_type' => 'staff',
                'verification_method' => 'secure_login',
                'latitude' => 38.8977,
                'longitude' => -77.0365,
            ])
            ->assertCreated()
            ->assertJsonPath('attendance.locationVerified', true);
    }

    public function test_old_coordinates_do_not_break_organization_payload(): void
    {
        [$organization, $admin] = $this->activeOrganizationAndUser('daycare_admin');
        $organization->update([
            'address_line1' => null,
            'standardized_address' => null,
            'latitude' => 45.1234567,
            'longitude' => -93.1234567,
            'attendance_radius_meters' => 100,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/manager/organization')
            ->assertOk()
            ->assertJsonPath('organization.latitude', 45.1234567)
            ->assertJsonPath('organization.longitude', -93.1234567);
    }

    private function locationPayload(): array
    {
        return [
            'address_line1' => '1600 Pennsylvania Avenue NW',
            'address_line2' => null,
            'city' => 'Washington',
            'state' => 'DC',
            'postal_code' => '20500',
            'country' => 'US',
            'radius' => 150,
        ];
    }

    private function activeOrganizationAndUser(string $role): array
    {
        $plan = PricingPlan::create([
            'name' => 'Starter',
            'code' => 'starter',
            'monthly_price' => 49,
            'yearly_price' => 490,
            'child_limit' => 12,
            'staff_limit' => 2,
            'device_limit' => 1,
            'status' => 'active',
            'featured' => false,
            'available_for_family_child_care' => true,
            'available_for_center_daycare' => true,
        ]);
        $organization = Organization::create([
            'name' => 'Settings Center',
            'organization_code' => 'SET001',
            'facility_type' => 'center_daycare',
            'status' => 'active',
            'approved_at' => now(),
            'plan' => 'Starter',
            'latitude' => 45.0000000,
            'longitude' => -93.0000000,
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
        $user = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => $role,
            'status' => 'active',
        ]);

        return [$organization, $user];
    }
}
