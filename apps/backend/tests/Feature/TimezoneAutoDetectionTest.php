<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\PricingPlan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\GeocodingService;
use App\Services\TimezoneLookupService;
use App\Services\USPSAddressService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class TimezoneAutoDetectionTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @dataProvider timezoneByCityProvider
     */
    public function test_attendance_location_detects_correct_timezone_from_coordinates(float $lat, float $lng, string $expectedTimezone, string $city, string $state, string $zip): void
    {
        $this->bindAddressPipeline($lat, $lng, $expectedTimezone);
        [$organization, $admin] = $this->activeOrganizationAndUser();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location/validate', $this->locationPayload($city, $state, $zip))
            ->assertOk()
            ->assertJsonPath('timezone', $expectedTimezone)
            ->assertJsonPath('latitude', $lat)
            ->assertJsonPath('longitude', $lng);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location', $this->locationPayload($city, $state, $zip))
            ->assertOk()
            ->assertJsonPath('timezone', $expectedTimezone)
            ->assertJsonPath('organization.timezone', $expectedTimezone);

        $organization->refresh();
        $this->assertSame($expectedTimezone, $organization->timezone);
    }

    public static function timezoneByCityProvider(): array
    {
        return [
            'Seattle detects Los Angeles timezone' => [47.6062, -122.3321, 'America/Los_Angeles', 'Seattle', 'WA', '98101'],
            'New York detects New York timezone' => [40.7128, -74.0060, 'America/New_York', 'New York', 'NY', '10001'],
            'Chicago detects Chicago timezone' => [41.8781, -87.6298, 'America/Chicago', 'Chicago', 'IL', '60601'],
            'Phoenix detects Phoenix timezone' => [33.4484, -112.0740, 'America/Phoenix', 'Phoenix', 'AZ', '85001'],
        ];
    }

    public function test_timezone_lookup_failure_returns_friendly_validation_error_and_does_not_save(): void
    {
        $this->bindAddressPipeline(0.0, 0.0, null);
        [$organization, $admin] = $this->activeOrganizationAndUser();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location/validate', $this->locationPayload('Nowhere', 'XX', '00000'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['address'])
            ->assertSee('We could not automatically determine the timezone for this address.');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location', $this->locationPayload('Nowhere', 'XX', '00000'))
            ->assertUnprocessable();

        $organization->refresh();
        $this->assertNull($organization->latitude);
        $this->assertSame('Africa/Nairobi', $organization->timezone);
    }

    public function test_registration_ignores_applicant_supplied_timezone_and_uses_auto_detected_value(): void
    {
        $this->bindAddressPipeline(41.8781, -87.6298, 'America/Chicago');
        $plan = PricingPlan::create([
            'name' => 'Starter',
            'code' => 'starter-override',
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

        $validated = $this->postJson('/api/public/validate-address', [
            'address_line1' => '233 S Wacker Dr',
            'address_line2' => null,
            'city' => 'Chicago',
            'state' => 'IL',
            'postal_code' => '60606',
            'country' => 'US',
        ])->assertOk()->assertJsonPath('timezone', 'America/Chicago')->json();

        $created = $this->postJson('/api/registration-applications', [
            'facility_type' => 'family_child_care',
            'business_name' => 'Windy City Family Care',
            'owner_name' => 'Chicago Owner',
            'owner_email' => 'chicago-owner@example.test',
            'password' => 'secret-password',
            'password_confirmation' => 'secret-password',
            'phone' => '555-0100',
            'address_validation_token' => $validated['validation_token'],
            'address_line1' => $validated['address_line1'],
            'address_line2' => $validated['address_line2'],
            'city' => $validated['city'],
            'state' => $validated['state'],
            'postal_code' => $validated['postal_code'],
            'country' => $validated['country'],
            'attendance_radius_meters' => 100,
            // Deliberately wrong: the applicant-supplied timezone must never be trusted.
            'timezone' => 'America/New_York',
            'license_status' => 'not_provided',
            'pricing_plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ]);

        $created->assertCreated()->assertJsonPath('application.timezone', 'America/Chicago');

        $admin = User::factory()->create(['role' => 'super_admin']);
        $approved = $this->actingAs($admin, 'sanctum')->postJson(
            '/api/platform/registration-applications/'.$created->json('application.id').'/approve',
            ['pricing_plan_id' => $plan->id, 'billing_cycle' => 'monthly']
        );

        $organization = Organization::findOrFail($approved->json('organization.id'));
        $this->assertSame('America/Chicago', $organization->timezone);
    }

    private function bindAddressPipeline(float $lat, float $lng, ?string $timezone): void
    {
        $this->app->instance(USPSAddressService::class, new class extends USPSAddressService {
            public function validate(array $address): array
            {
                $line1 = strtoupper((string) $address['address_line1']);
                $city = strtoupper((string) $address['city']);
                $state = strtoupper((string) $address['state']);
                $zip = (string) $address['postal_code'];

                return [
                    'address_line1' => $line1,
                    'address_line2' => null,
                    'city' => $city,
                    'state' => $state,
                    'postal_code' => $zip,
                    'country' => 'US',
                    'standardized_address' => "{$line1}, {$city}, {$state} {$zip}",
                ];
            }
        });

        $this->app->instance(GeocodingService::class, new class($lat, $lng) extends GeocodingService {
            public function __construct(private float $lat, private float $lng)
            {
            }

            public function geocode(array $address): array
            {
                return [
                    'latitude' => $this->lat,
                    'longitude' => $this->lng,
                    'geocoding_provider' => 'nominatim',
                ];
            }
        });

        $this->app->instance(TimezoneLookupService::class, new class($timezone) extends TimezoneLookupService {
            public function __construct(private ?string $timezone)
            {
            }

            public function resolve(float $latitude, float $longitude): string
            {
                if (! $this->timezone) {
                    throw ValidationException::withMessages([
                        'address' => ['We could not automatically determine the timezone for this address. Please double-check the address and try again.'],
                    ]);
                }

                return $this->timezone;
            }
        });
    }

    private function locationPayload(string $city, string $state, string $zip): array
    {
        return [
            'address_line1' => '100 Test Street',
            'address_line2' => null,
            'city' => $city,
            'state' => $state,
            'postal_code' => $zip,
            'country' => 'US',
            'radius' => 100,
        ];
    }

    private function activeOrganizationAndUser(): array
    {
        $plan = PricingPlan::create([
            'name' => 'Starter',
            'code' => 'starter-tz-'.uniqid(),
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
            'name' => 'Timezone Test Center',
            'organization_code' => 'TZ'.random_int(10000, 99999),
            'facility_type' => 'center_daycare',
            'status' => 'active',
            'approved_at' => now(),
            'plan' => 'Starter',
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
            'role' => 'daycare_admin',
            'status' => 'active',
        ]);

        return [$organization, $user];
    }
}
