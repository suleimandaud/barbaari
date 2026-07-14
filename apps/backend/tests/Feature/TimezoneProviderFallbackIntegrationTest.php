<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\PricingPlan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\GeocodingService;
use App\Services\USPSAddressService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * End-to-end proof (real routes, real ApiController, real TimezoneLookupService, real
 * TimeApiProvider/GeoNamesProvider — only the outbound HTTP calls are faked) that a
 * TimeAPI outage does not block a provider from saving their attendance location, as long
 * as a second provider is configured. This is the scenario the whole multi-provider
 * architecture exists for.
 */
class TimezoneProviderFallbackIntegrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->app->instance(USPSAddressService::class, new class extends USPSAddressService {
            public function validate(array $address): array
            {
                return [
                    'address_line1' => '400 BROAD ST',
                    'address_line2' => null,
                    'city' => 'SEATTLE',
                    'state' => 'WA',
                    'postal_code' => '98109',
                    'country' => 'US',
                    'standardized_address' => '400 BROAD ST, SEATTLE, WA 98109',
                ];
            }
        });

        $this->app->instance(GeocodingService::class, new class extends GeocodingService {
            public function geocode(array $address): array
            {
                return ['latitude' => 47.6205, 'longitude' => -122.3493, 'geocoding_provider' => 'nominatim'];
            }
        });

        config(['services.timezone_lookup.geonames_username' => 'configured-user']);
    }

    public function test_timeapi_http_failure_falls_through_to_geonames_and_the_user_never_sees_an_error(): void
    {
        Http::fake([
            'www.timeapi.io/*' => Http::response('Internal Server Error', 500),
            'api.geonames.org/*' => Http::response(['timezoneId' => 'America/Los_Angeles'], 200),
        ]);

        [, $admin] = $this->activeOrganizationAndUser();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location/validate', $this->locationPayload())
            ->assertOk()
            ->assertJsonPath('timezone', 'America/Los_Angeles');
    }

    public function test_timeapi_connection_timeout_falls_through_to_geonames(): void
    {
        Http::fake([
            'www.timeapi.io/*' => function () {
                throw new ConnectionException('cURL error 28: Operation timed out after 6000 milliseconds');
            },
            'api.geonames.org/*' => Http::response(['timezoneId' => 'America/Los_Angeles'], 200),
        ]);

        [, $admin] = $this->activeOrganizationAndUser();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location/validate', $this->locationPayload())
            ->assertOk()
            ->assertJsonPath('timezone', 'America/Los_Angeles');
    }

    public function test_both_providers_failing_still_returns_one_generic_friendly_error(): void
    {
        Http::fake([
            'www.timeapi.io/*' => Http::response('down', 503),
            'api.geonames.org/*' => Http::response('down', 503),
        ]);

        [, $admin] = $this->activeOrganizationAndUser();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location/validate', $this->locationPayload())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['address']);

        $body = strtolower(json_encode($response->json()));
        $this->assertStringNotContainsString('timeapi', $body);
        $this->assertStringNotContainsString('geonames', $body);
    }

    public function test_saving_attendance_location_also_survives_a_timeapi_outage(): void
    {
        Http::fake([
            'www.timeapi.io/*' => Http::response('down', 503),
            'api.geonames.org/*' => Http::response(['timezoneId' => 'America/Los_Angeles'], 200),
        ]);

        [$organization, $admin] = $this->activeOrganizationAndUser();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/settings/attendance-location', $this->locationPayload())
            ->assertOk()
            ->assertJsonPath('organization.timezone', 'America/Los_Angeles');

        $organization->refresh();
        $this->assertSame('America/Los_Angeles', $organization->timezone);
    }

    private function locationPayload(): array
    {
        return [
            'address_line1' => '400 Broad St',
            'address_line2' => null,
            'city' => 'Seattle',
            'state' => 'WA',
            'postal_code' => '98109',
            'country' => 'US',
            'radius' => 100,
        ];
    }

    private function activeOrganizationAndUser(): array
    {
        $plan = PricingPlan::create([
            'name' => 'Starter',
            'code' => 'starter-fallback-'.uniqid(),
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
            'name' => 'Fallback Test Center',
            'organization_code' => 'FB'.random_int(10000, 99999),
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
