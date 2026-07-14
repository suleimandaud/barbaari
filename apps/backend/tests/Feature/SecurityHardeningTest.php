<?php

namespace Tests\Feature;

use App\Models\Child;
use App\Models\Classroom;
use App\Models\Device;
use App\Models\Guardian;
use App\Models\Organization;
use App\Models\PaymentProviderEvent;
use App\Models\PricingPlan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the security audit fixes: privilege escalation via public
 * registration, cross-tenant IDOR on guardian/invoice/device linking, role
 * self-escalation, and Stripe payment-session ownership.
 */
class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    // --- Public registration can no longer set role or organization_id ---

    public function test_public_registration_ignores_client_supplied_role_and_creates_an_unaffiliated_parent(): void
    {
        [$organization] = $this->activeOrganization();

        $response = $this->postJson('/api/auth/register', [
            'name' => 'Attacker',
            'email' => 'attacker@example.test',
            'password' => 'password123',
            'role' => 'super_admin',
            'organization_id' => $organization->id,
        ]);

        $response->assertCreated();
        $user = User::where('email', 'attacker@example.test')->firstOrFail();
        $this->assertSame('parent', $user->role);
        $this->assertNull($user->organization_id);
    }

    public function test_public_registration_still_works_for_the_legitimate_mobile_parent_flow(): void
    {
        // Mirrors exactly what apps/mobile/services/auth.ts registerParentMobile() sends.
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Real Parent',
            'email' => 'real-parent@example.test',
            'password' => 'password123',
            'role' => 'parent',
        ]);

        $response->assertCreated()->assertJsonStructure(['user', 'token']);
        $this->assertSame('parent', User::where('email', 'real-parent@example.test')->firstOrFail()->role);
    }

    // --- Cross-tenant IDOR: linking a guardian from another organization ---

    public function test_cannot_link_a_guardian_belonging_to_another_organization(): void
    {
        [$orgA, $adminA] = $this->activeOrganization('daycare_admin');
        [$orgB] = $this->activeOrganization();
        $childA = Child::create(['organization_id' => $orgA->id, 'first_name' => 'A', 'last_name' => 'Kid', 'status' => 'active']);
        $guardianB = Guardian::create(['organization_id' => $orgB->id, 'name' => 'Org B Guardian']);

        $this->actingAs($adminA, 'sanctum')
            ->postJson("/api/children/{$childA->id}/guardians", ['guardian_id' => $guardianB->id])
            ->assertNotFound();

        $this->assertDatabaseMissing('child_guardians', ['child_id' => $childA->id, 'guardian_id' => $guardianB->id]);
    }

    public function test_can_still_link_a_guardian_from_the_same_organization(): void
    {
        [$orgA, $adminA] = $this->activeOrganization('daycare_admin');
        $childA = Child::create(['organization_id' => $orgA->id, 'first_name' => 'A', 'last_name' => 'Kid', 'status' => 'active']);
        $guardianA = Guardian::create(['organization_id' => $orgA->id, 'name' => 'Org A Guardian']);

        $this->actingAs($adminA, 'sanctum')
            ->postJson("/api/children/{$childA->id}/guardians", ['guardian_id' => $guardianA->id])
            ->assertOk();

        $this->assertDatabaseHas('child_guardians', ['child_id' => $childA->id, 'guardian_id' => $guardianA->id]);
    }

    // --- Cross-tenant IDOR: creating an invoice referencing another org's child/guardian ---

    public function test_cannot_create_an_invoice_referencing_another_organizations_child(): void
    {
        [, $adminA] = $this->activeOrganization('daycare_admin');
        [$orgB] = $this->activeOrganization();
        $childB = Child::create(['organization_id' => $orgB->id, 'first_name' => 'B', 'last_name' => 'Kid', 'status' => 'active']);

        $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/billing/invoices', [
                'child_id' => $childB->id,
                'amount' => 100,
                'due_date' => now()->addWeek()->toDateString(),
            ])
            ->assertNotFound();

        $this->assertDatabaseMissing('invoices', ['child_id' => $childB->id]);
    }

    // --- Cross-tenant IDOR: assigning a device/classroom from another org ---

    public function test_cannot_register_a_device_against_another_organizations_classroom(): void
    {
        [, $adminA] = $this->activeOrganization('daycare_admin');
        [$orgB] = $this->activeOrganization();
        $classroomB = Classroom::create(['organization_id' => $orgB->id, 'name' => 'Org B Room']);

        $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/devices', [
                'name' => 'Kiosk 1',
                'identifier' => 'device-'.uniqid(),
                'classroom_id' => $classroomB->id,
            ])
            ->assertNotFound();
    }

    public function test_cannot_assign_a_device_to_another_organizations_classroom(): void
    {
        [$orgA, $adminA] = $this->activeOrganization('daycare_admin');
        [$orgB] = $this->activeOrganization();
        $deviceA = Device::create(['organization_id' => $orgA->id, 'name' => 'Kiosk', 'identifier' => 'device-'.uniqid()]);
        $classroomB = Classroom::create(['organization_id' => $orgB->id, 'name' => 'Org B Room']);

        $this->actingAs($adminA, 'sanctum')
            ->postJson("/api/devices/{$deviceA->id}/assign-classroom", ['classroom_id' => $classroomB->id])
            ->assertNotFound();
    }

    // --- Role self-escalation: a manager cannot grant daycare_admin ---

    public function test_manager_cannot_promote_self_to_daycare_admin_via_update_user(): void
    {
        [$org, $manager] = $this->activeOrganization('manager');

        $this->actingAs($manager, 'sanctum')
            ->putJson("/api/users/{$manager->id}", ['role' => 'daycare_admin'])
            ->assertForbidden();

        $this->assertSame('manager', $manager->fresh()->role);
    }

    public function test_manager_cannot_promote_another_user_to_daycare_admin_via_assign_role(): void
    {
        [$org, $manager] = $this->activeOrganization('manager');
        $staff = User::factory()->create(['organization_id' => $org->id, 'role' => 'staff', 'status' => 'active']);

        $this->actingAs($manager, 'sanctum')
            ->postJson("/api/users/{$staff->id}/assign-role", ['role' => 'daycare_admin'])
            ->assertForbidden();

        $this->assertSame('staff', $staff->fresh()->role);
    }

    public function test_daycare_admin_can_still_promote_a_manager_to_daycare_admin(): void
    {
        [$org, $admin] = $this->activeOrganization('daycare_admin');
        $manager = User::factory()->create(['organization_id' => $org->id, 'role' => 'manager', 'status' => 'active']);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/users/{$manager->id}/assign-role", ['role' => 'daycare_admin'])
            ->assertOk();

        $this->assertSame('daycare_admin', $manager->fresh()->role);
    }

    public function test_manager_can_still_promote_staff_to_manager(): void
    {
        [$org, $manager] = $this->activeOrganization('manager');
        $staff = User::factory()->create(['organization_id' => $org->id, 'role' => 'staff', 'status' => 'active']);

        $this->actingAs($manager, 'sanctum')
            ->postJson("/api/users/{$staff->id}/assign-role", ['role' => 'manager'])
            ->assertOk();

        $this->assertSame('manager', $staff->fresh()->role);
    }

    // --- Stripe session ownership on confirm-session ---

    public function test_confirming_a_stripe_session_belonging_to_another_organization_is_rejected(): void
    {
        [$orgA, $adminA] = $this->activeOrganization('daycare_admin');
        [$orgB] = $this->activeOrganization();
        $subA = Subscription::where('organization_id', $orgA->id)->latest()->first();
        $subA->update(['status' => 'pending_payment']);

        $fakeSession = (object) [
            'payment_status' => 'paid',
            'metadata' => (object) ['organization_id' => (string) $orgB->id],
        ];
        $sessionsStub = \Mockery::mock();
        $sessionsStub->shouldReceive('retrieve')->andReturn($fakeSession);
        $checkoutStub = (object) ['sessions' => $sessionsStub];
        $clientStub = new class($checkoutStub) extends \Stripe\StripeClient {
            public function __construct(private object $checkoutStub)
            {
            }

            public function __get($name)
            {
                return $name === 'checkout' ? $this->checkoutStub : parent::__get($name);
            }
        };

        $this->mock(\App\Services\StripeService::class, function ($mock) use ($clientStub) {
            $mock->shouldReceive('isConfigured')->andReturn(true);
            $mock->shouldReceive('client')->andReturn($clientStub);
        });

        $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/daycare/billing/stripe/confirm-session', ['session_id' => 'cs_test_belongs_to_org_b'])
            ->assertForbidden();

        $this->assertSame('pending_payment', $subA->fresh()->status);
    }

    // --- Stripe webhook idempotency ---

    public function test_a_duplicate_stripe_webhook_event_is_not_reprocessed(): void
    {
        [$org] = $this->activeOrganization();
        $subscription = Subscription::where('organization_id', $org->id)->latest()->first();

        PaymentProviderEvent::create([
            'provider' => 'stripe',
            'mode' => 'test',
            'event_id' => 'evt_already_processed',
            'event_type' => 'customer.subscription.deleted',
            'status' => 'processed',
            'processed_at' => now(),
        ]);

        $fakeEvent = \Stripe\Event::constructFrom([
            'id' => 'evt_already_processed',
            'type' => 'customer.subscription.deleted',
            'data' => ['object' => ['id' => $subscription->stripe_subscription_id ?? 'sub_x']],
        ]);

        $this->mock(\App\Services\StripeService::class, function ($mock) use ($fakeEvent) {
            $mock->shouldReceive('isConfigured')->andReturn(true);
            $mock->shouldReceive('constructWebhookEvent')->andReturn($fakeEvent);
        });

        $response = $this->postJson('/api/webhooks/stripe', [], ['Stripe-Signature' => 'test']);

        $response->assertOk()->assertJsonPath('duplicate', true);
        $this->assertSame(
            2, // the pre-seeded row + the duplicate-attempt row this request creates
            PaymentProviderEvent::where('event_id', 'evt_already_processed')->count()
        );
        $this->assertSame(
            1,
            PaymentProviderEvent::where('event_id', 'evt_already_processed')->where('status', 'duplicate_ignored')->count()
        );
    }

    // --- Dead/fake payment endpoint removed ---

    public function test_the_stripe_placeholder_endpoint_no_longer_exists(): void
    {
        [, $admin] = $this->activeOrganization('daycare_admin');

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/billing/stripe/placeholder')
            ->assertNotFound();
    }

    // --- Cross-tenant IDOR sweep: children, classrooms, staff, conversations ---

    public function test_cannot_create_a_child_in_another_organizations_classroom(): void
    {
        [, $adminA] = $this->activeOrganization('daycare_admin');
        [$orgB] = $this->activeOrganization();
        $classroomB = Classroom::create(['organization_id' => $orgB->id, 'name' => 'Org B Room']);

        $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/children', ['first_name' => 'A', 'last_name' => 'Kid', 'classroom_id' => $classroomB->id])
            ->assertNotFound();
    }

    public function test_cannot_move_a_child_into_another_organizations_classroom(): void
    {
        [$orgA, $adminA] = $this->activeOrganization('daycare_admin');
        [$orgB] = $this->activeOrganization();
        $childA = Child::create(['organization_id' => $orgA->id, 'first_name' => 'A', 'last_name' => 'Kid', 'status' => 'active']);
        $classroomB = Classroom::create(['organization_id' => $orgB->id, 'name' => 'Org B Room']);

        $this->actingAs($adminA, 'sanctum')
            ->putJson("/api/children/{$childA->id}", ['classroom_id' => $classroomB->id])
            ->assertNotFound();

        $this->actingAs($adminA, 'sanctum')
            ->postJson("/api/children/{$childA->id}/assign-classroom", ['classroom_id' => $classroomB->id])
            ->assertNotFound();
    }

    public function test_cannot_create_a_classroom_with_another_organizations_lead_staff(): void
    {
        [, $adminA] = $this->activeOrganization('daycare_admin');
        [$orgB] = $this->activeOrganization();
        $staffB = User::factory()->create(['organization_id' => $orgB->id, 'role' => 'staff', 'status' => 'active']);

        $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/classrooms', ['name' => 'Room 1', 'lead_staff_id' => $staffB->id])
            ->assertNotFound();
    }

    public function test_manager_cannot_create_a_new_user_with_daycare_admin_role(): void
    {
        [, $manager] = $this->activeOrganization('manager');

        $this->actingAs($manager, 'sanctum')
            ->postJson('/api/users', [
                'name' => 'New Admin',
                'email' => 'new-admin@example.test',
                'role' => 'daycare_admin',
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'new-admin@example.test']);
    }

    public function test_cannot_create_a_staff_user_assigned_to_another_organizations_classroom(): void
    {
        [, $adminA] = $this->activeOrganization('daycare_admin');
        [$orgB] = $this->activeOrganization();
        $classroomB = Classroom::create(['organization_id' => $orgB->id, 'name' => 'Org B Room']);

        $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/users', [
                'name' => 'New Staff',
                'email' => 'new-staff@example.test',
                'role' => 'staff',
                'classroom_id' => $classroomB->id,
            ])
            ->assertNotFound();
    }

    public function test_cannot_assign_staff_to_another_organizations_classroom(): void
    {
        [$orgA, $adminA] = $this->activeOrganization('daycare_admin');
        [$orgB] = $this->activeOrganization();
        $staffA = User::factory()->create(['organization_id' => $orgA->id, 'role' => 'staff', 'status' => 'active']);
        $classroomB = Classroom::create(['organization_id' => $orgB->id, 'name' => 'Org B Room']);

        $this->actingAs($adminA, 'sanctum')
            ->patchJson("/api/staff/{$staffA->id}/assign-classroom", ['classroom_id' => $classroomB->id])
            ->assertNotFound();
    }

    public function test_cannot_send_a_message_into_another_organizations_conversation(): void
    {
        [, $adminA] = $this->activeOrganization('daycare_admin');
        [$orgB] = $this->activeOrganization();
        $conversationB = \App\Models\Conversation::create(['organization_id' => $orgB->id, 'subject' => 'Org B thread']);

        $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/messages', ['conversation_id' => $conversationB->id, 'body' => 'Hi'])
            ->assertNotFound();

        $this->assertDatabaseMissing('messages', ['conversation_id' => $conversationB->id]);
    }

    private function activeOrganization(string $role = 'daycare_admin'): array
    {
        $plan = PricingPlan::firstOrCreate(
            ['code' => 'starter-security-'.uniqid()],
            [
                'name' => 'Starter',
                'monthly_price' => 49,
                'yearly_price' => 490,
                'child_limit' => 12,
                'staff_limit' => 2,
                'device_limit' => 1,
                'status' => 'active',
                'featured' => false,
                'available_for_family_child_care' => true,
                'available_for_center_daycare' => true,
            ]
        );
        $organization = Organization::create([
            'name' => 'Security Test Org '.uniqid(),
            'organization_code' => 'SEC'.random_int(10000, 99999),
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
            'role' => $role,
            'status' => 'active',
        ]);

        return [$organization, $user];
    }
}
