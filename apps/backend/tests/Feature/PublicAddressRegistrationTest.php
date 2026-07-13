<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\OrganizationInvitation;
use App\Models\PricingPlan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\GeocodingService;
use App\Services\TimezoneLookupService;
use App\Services\USPSAddressService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class PublicAddressRegistrationTest extends TestCase
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

    public function test_public_address_validation_returns_standardized_address_and_coordinates(): void
    {
        $response = $this->postJson('/api/public/validate-address', $this->addressPayload());

        $response->assertOk()
            ->assertJsonPath('standardized_address', '1600 PENNSYLVANIA AVE NW, WASHINGTON, DC 20500')
            ->assertJsonPath('city', 'WASHINGTON')
            ->assertJsonPath('state', 'DC')
            ->assertJsonPath('postal_code', '20500')
            ->assertJsonPath('latitude', 38.8977)
            ->assertJsonPath('longitude', -77.0365)
            ->assertJsonPath('geocoding_provider', 'nominatim')
            ->assertJsonPath('timezone', 'America/New_York')
            ->assertJsonStructure(['validation_token']);
    }

    public function test_invalid_address_returns_friendly_error(): void
    {
        $response = $this->postJson('/api/public/validate-address', [
            ...$this->addressPayload(),
            'address_line1' => 'Invalid',
        ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['address'])
            ->assertSee('We could not validate this address. Please check the street, city, state, and ZIP code.');
    }

    public function test_registration_requires_validated_address_token(): void
    {
        $plan = $this->starterPlan();

        $response = $this->postJson('/api/registration-applications', [
            ...$this->applicationPayload($plan),
            'address_validation_token' => '',
        ]);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['address_validation_token']);
    }

    public function test_registration_stores_validated_address_coordinates_and_approval_copies_to_organization(): void
    {
        Mail::fake();
        $plan = $this->starterPlan();
        $validated = $this->postJson('/api/public/validate-address', $this->addressPayload())->json();

        $created = $this->postJson('/api/registration-applications', [
            ...$this->applicationPayload($plan),
            'address_validation_token' => $validated['validation_token'],
            'address_line1' => $validated['address_line1'],
            'address_line2' => $validated['address_line2'],
            'city' => $validated['city'],
            'state' => $validated['state'],
            'postal_code' => $validated['postal_code'],
            'country' => $validated['country'],
        ]);

        $created->assertCreated()
            ->assertJsonPath('application.standardized_address', '1600 PENNSYLVANIA AVE NW, WASHINGTON, DC 20500')
            ->assertJsonPath('application.latitude', 38.8977)
            ->assertJsonPath('application.longitude', -77.0365)
            ->assertJsonPath('application.timezone', 'America/New_York');
        $created->assertJsonMissing(['password']);
        $created->assertJsonMissing(['password_hash']);

        $owner = User::where('email', 'owner@example.test')->firstOrFail();
        $this->assertSame('pending_approval', $owner->status);
        $this->assertNull($owner->organization_id);
        $this->assertTrue(Hash::check('secret-password', $owner->password));

        $pendingLogin = $this->postJson('/api/auth/login', [
            'email' => 'owner@example.test',
            'password' => 'secret-password',
        ]);
        $pendingLogin->assertOk()
            ->assertJsonPath('user.application_status', 'pending')
            ->assertJsonPath('user.can_access_dashboard', false)
            ->assertJsonMissing(['password']);
        $this->withToken($pendingLogin->json('token'))->getJson('/api/manager/dashboard')
            ->assertForbidden()
            ->assertJsonPath('message', 'Your application is still pending approval.');

        $admin = User::factory()->create(['role' => 'super_admin']);
        $approved = $this->actingAs($admin, 'sanctum')->postJson(
            '/api/platform/registration-applications/'.$created->json('application.id').'/approve',
            ['pricing_plan_id' => $plan->id, 'billing_cycle' => 'monthly']
        );

        $approved->assertCreated()
            ->assertJsonCount(0, 'invitations')
            ->assertJsonPath('invite_note', 'Owner can now log in using the email and password created during registration.');
        $this->assertSame(0, OrganizationInvitation::where('email', 'owner@example.test')->count());
        $organization = Organization::findOrFail($approved->json('organization.id'));
        $owner->refresh();

        $this->assertSame('1600 PENNSYLVANIA AVE NW, WASHINGTON, DC 20500', $organization->standardized_address);
        $this->assertSame('20500', $organization->postal_code);
        $this->assertSame('nominatim', $organization->geocoding_provider);
        $this->assertEquals(38.8977, (float) $organization->latitude);
        $this->assertEquals(-77.0365, (float) $organization->longitude);
        $this->assertSame('America/New_York', $organization->timezone);
        $this->assertSame(100, (int) $organization->attendance_radius_meters);
        $this->assertSame('active', $owner->status);
        $this->assertSame($organization->id, $owner->organization_id);

        $approvedLogin = $this->postJson('/api/auth/login', [
            'email' => 'owner@example.test',
            'password' => 'secret-password',
        ]);
        $approvedLogin->assertOk()
            ->assertJsonPath('user.application_status', 'approved')
            ->assertJsonPath('user.payment_required', true)
            ->assertJsonPath('user.can_access_dashboard', false)
            ->assertJsonMissing(['password']);
        $this->actingAs($owner->fresh(), 'sanctum')->getJson('/api/manager/dashboard')
            ->assertStatus(402)
            ->assertJsonPath('redirect_to', '/subscription-payment');

        Subscription::where('organization_id', $organization->id)->latest()->firstOrFail()->update(['status' => 'active']);
        $organization->update(['status' => 'active', 'approved_at' => now()]);
        $this->actingAs($owner->fresh(), 'sanctum')->getJson('/api/manager/dashboard')->assertOk();
    }

    public function test_rejected_application_owner_can_log_in_but_cannot_access_dashboard(): void
    {
        $plan = $this->starterPlan();
        $validated = $this->postJson('/api/public/validate-address', $this->addressPayload())->json();
        $created = $this->postJson('/api/registration-applications', [
            ...$this->applicationPayload($plan, 'rejected-owner@example.test'),
            'address_validation_token' => $validated['validation_token'],
            'address_line1' => $validated['address_line1'],
            'address_line2' => $validated['address_line2'],
            'city' => $validated['city'],
            'state' => $validated['state'],
            'postal_code' => $validated['postal_code'],
            'country' => $validated['country'],
        ]);

        $admin = User::factory()->create(['role' => 'super_admin']);
        $this->actingAs($admin, 'sanctum')->postJson(
            '/api/platform/registration-applications/'.$created->json('application.id').'/reject',
            ['review_notes' => 'Not approved.']
        )->assertOk();

        $login = $this->postJson('/api/auth/login', [
            'email' => 'rejected-owner@example.test',
            'password' => 'secret-password',
        ]);
        $login->assertOk()
            ->assertJsonPath('user.application_status', 'rejected')
            ->assertJsonPath('user.can_access_dashboard', false);
        $this->actingAs(User::where('email', 'rejected-owner@example.test')->firstOrFail(), 'sanctum')->getJson('/api/manager/dashboard')
            ->assertForbidden()
            ->assertJsonPath('message', 'Your application was not approved. Please contact support.');
    }

    public function test_staff_invite_flow_still_creates_invitation(): void
    {
        Mail::fake();
        $plan = $this->starterPlan();
        $organization = Organization::create([
            'name' => 'Active Center',
            'organization_code' => 'ACT001',
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
        $admin = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => 'daycare_admin',
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum')->postJson('/api/staff', [
            'name' => 'Staff Invitee',
            'email' => 'staff-invitee@example.test',
            'role' => 'staff',
            'status' => 'active',
        ])->assertCreated();

        $invitation = OrganizationInvitation::where('email', 'staff-invitee@example.test')->firstOrFail();

        $this->postJson('/api/invitations/'.$invitation->token.'/accept', [
            'password' => 'staff-password',
            'password_confirmation' => 'staff-password',
        ])->assertOk();

        $invitation->refresh();
        $staff = User::where('email', 'staff-invitee@example.test')->firstOrFail();
        $this->assertSame('accepted', $invitation->status);
        $this->assertSame('active', $staff->status);
        $this->assertTrue(Hash::check('staff-password', $staff->password));
    }

    private function addressPayload(): array
    {
        return [
            'address_line1' => '1600 Pennsylvania Avenue NW',
            'address_line2' => null,
            'city' => 'Washington',
            'state' => 'DC',
            'postal_code' => '20500',
            'country' => 'US',
        ];
    }

    private function applicationPayload(PricingPlan $plan, string $email = 'owner@example.test'): array
    {
        return [
            'facility_type' => 'family_child_care',
            'business_name' => 'Pilot Family Care',
            'owner_name' => 'Pilot Owner',
            'owner_email' => $email,
            'password' => 'secret-password',
            'password_confirmation' => 'secret-password',
            'phone' => '555-0100',
            'address_line1' => '1600 PENNSYLVANIA AVE NW',
            'address_line2' => null,
            'city' => 'WASHINGTON',
            'state' => 'DC',
            'postal_code' => '20500',
            'country' => 'US',
            'attendance_radius_meters' => 100,
            'timezone' => 'America/New_York',
            'license_status' => 'not_provided',
            'pricing_plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
        ];
    }

    private function starterPlan(): PricingPlan
    {
        return PricingPlan::create([
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
    }
}
