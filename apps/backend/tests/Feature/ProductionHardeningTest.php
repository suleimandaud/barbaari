<?php

namespace Tests\Feature;

use App\Models\Child;
use App\Models\Classroom;
use App\Models\Guardian;
use App\Models\IncidentReport;
use App\Models\Invoice;
use App\Models\Organization;
use App\Models\PinVerificationLog;
use App\Models\PlatformInvoice;
use App\Models\PlatformPayment;
use App\Models\PricingPlan;
use App\Models\Role;
use App\Models\StaffProfile;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression coverage for the production-hardening audit: PIN/tablet auth bypasses,
 * platform role escalation, cross-tenant and intra-tenant data exposure, Stripe payment
 * replay/double-settlement, and production-only safety guards.
 */
class ProductionHardeningTest extends TestCase
{
    use RefreshDatabase;

    // --- PIN login: a locked or inactive account must never receive a token ---

    public function test_pin_login_does_not_issue_a_token_for_a_locked_account(): void
    {
        [, $staff] = $this->activeOrganization('staff');
        $staff->update(['pin_hash' => Hash::make('4321')]);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/pin-login', ['email' => $staff->email, 'pin' => '0000'])->assertUnprocessable();
        }

        // Account is now locked: even a wrong PIN must not be answered with a token.
        $this->postJson('/api/auth/pin-login', ['email' => $staff->email, 'pin' => '9999'])
            ->assertStatus(423)
            ->assertJsonMissingPath('token');
        $this->assertSame(0, $staff->tokens()->count());
    }

    public function test_pin_login_does_not_issue_a_token_for_an_inactive_account(): void
    {
        [, $staff] = $this->activeOrganization('staff');
        $staff->update(['pin_hash' => Hash::make('4321'), 'status' => 'inactive']);

        $this->postJson('/api/auth/pin-login', ['email' => $staff->email, 'pin' => '0000'])
            ->assertForbidden()
            ->assertJsonMissingPath('token');
        $this->assertSame(0, $staff->tokens()->count());
    }

    public function test_pin_login_still_works_with_the_correct_pin(): void
    {
        [, $staff] = $this->activeOrganization('staff');
        $staff->update(['pin_hash' => Hash::make('4321')]);

        $this->postJson('/api/auth/pin-login', ['email' => $staff->email, 'pin' => '4321'])
            ->assertOk()
            ->assertJsonStructure(['token', 'user', 'pin_verification_id']);
    }

    // --- Tablet unlock: per-account lockout against PIN brute force ---

    public function test_tablet_unlock_locks_the_account_after_repeated_wrong_pins(): void
    {
        [, $staff] = $this->activeOrganization('staff');
        $staff->update(['pin_hash' => Hash::make('4321')]);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/tablet-unlock', ['mode' => 'staff', 'email' => $staff->email, 'pin' => '0000'])->assertUnprocessable();
        }

        // Correct PIN during the lockout window is still refused.
        $this->postJson('/api/auth/tablet-unlock', ['mode' => 'staff', 'email' => $staff->email, 'pin' => '4321'])
            ->assertStatus(423)
            ->assertJsonMissingPath('token');
        $this->assertSame(0, $staff->tokens()->count());
    }

    public function test_tablet_unlock_still_works_with_the_correct_pin(): void
    {
        [, $staff] = $this->activeOrganization('staff');
        $staff->update(['pin_hash' => Hash::make('4321')]);

        $this->postJson('/api/auth/tablet-unlock', ['mode' => 'staff', 'email' => $staff->email, 'pin' => '4321'])
            ->assertOk()
            ->assertJsonStructure(['token', 'mode', 'visible_child_ids']);
    }

    // --- Platform role escalation ---

    public function test_support_staff_cannot_promote_themselves_to_super_admin(): void
    {
        $support = User::factory()->create(['role' => 'support_staff', 'status' => 'active', 'organization_id' => null]);

        $this->actingAs($support, 'sanctum')
            ->patchJson("/api/platform/users/{$support->id}/role", ['role' => 'super_admin'])
            ->assertForbidden();
        $this->actingAs($support, 'sanctum')
            ->patchJson("/api/super-admin/users/{$support->id}/role", ['role' => 'super_admin'])
            ->assertForbidden();

        $this->assertSame('support_staff', $support->fresh()->role);
    }

    public function test_support_staff_cannot_modify_pricing_through_the_duplicate_super_admin_routes(): void
    {
        $support = User::factory()->create(['role' => 'support_staff', 'status' => 'active', 'organization_id' => null]);
        $plan = PricingPlan::create(['name' => 'Growth', 'code' => 'growth', 'monthly_price' => 99, 'status' => 'active']);

        $this->actingAs($support, 'sanctum')
            ->patchJson("/api/super-admin/pricing-plans/{$plan->id}", ['monthly_price' => 1])
            ->assertForbidden();

        $this->assertEquals(99, (float) $plan->fresh()->monthly_price);
    }

    public function test_support_staff_cannot_block_a_super_admin(): void
    {
        $support = User::factory()->create(['role' => 'support_staff', 'status' => 'active', 'organization_id' => null]);
        $superAdmin = User::factory()->create(['role' => 'super_admin', 'status' => 'active', 'organization_id' => null]);

        $this->actingAs($support, 'sanctum')
            ->patchJson("/api/platform/users/{$superAdmin->id}/block")
            ->assertForbidden();

        $this->assertSame('active', $superAdmin->fresh()->status);
    }

    public function test_a_demoted_super_admin_with_a_stale_role_pivot_loses_platform_access(): void
    {
        $superAdmin = User::factory()->create(['role' => 'super_admin', 'status' => 'active', 'organization_id' => null]);
        $demoted = User::factory()->create(['role' => 'super_admin', 'status' => 'active', 'organization_id' => null]);
        $demoted->roles()->sync([Role::firstOrCreate(['name' => 'super_admin'], ['label' => 'Super Admin'])->id]);

        $this->actingAs($superAdmin, 'sanctum')
            ->patchJson("/api/platform/users/{$demoted->id}/role", ['role' => 'parent'])
            ->assertOk();

        $demoted->refresh();
        $this->assertSame(['parent'], $demoted->roles()->pluck('name')->all());

        // Even a pivot row left behind by an older role change must not grant access.
        $demoted->roles()->attach(Role::where('name', 'super_admin')->value('id'));
        $this->actingAs($demoted->fresh(), 'sanctum')
            ->getJson('/api/platform/dashboard')
            ->assertForbidden();
    }

    // --- Cross-tenant leak: staff classroom children ---

    public function test_staff_classroom_children_never_returns_another_organizations_children(): void
    {
        [$orgA, $staffA] = $this->activeOrganization('staff');
        StaffProfile::create(['organization_id' => $orgA->id, 'user_id' => $staffA->id, 'classroom_id' => null]);
        [$orgB] = $this->activeOrganization('daycare_admin', 'family_child_care');
        Child::create(['organization_id' => $orgB->id, 'first_name' => 'OtherTenant', 'last_name' => 'Child', 'status' => 'active', 'classroom_id' => null]);
        $ownChild = Child::create(['organization_id' => $orgA->id, 'first_name' => 'Own', 'last_name' => 'Child', 'status' => 'active', 'classroom_id' => null]);

        $response = $this->actingAs($staffA, 'sanctum')->getJson('/api/staff/classroom-children')->assertOk();

        $names = collect($response->json('children'))->pluck('name')->all();
        $this->assertNotContains('OtherTenant Child', $names);
        $this->assertContains('Own Child', $names);
        $this->assertTrue(collect($response->json('children'))->every(fn ($child) => (string) $child['id'] === (string) $ownChild->id));
    }

    // --- Intra-tenant visibility on single-record endpoints ---

    public function test_a_parent_cannot_view_another_familys_invoice(): void
    {
        [$org, $parent] = $this->activeOrganization('parent');
        $otherGuardian = Guardian::create(['organization_id' => $org->id, 'name' => 'Other Family']);
        $otherInvoice = Invoice::create(['organization_id' => $org->id, 'guardian_id' => $otherGuardian->id, 'invoice_number' => 'INV-OTHER', 'amount' => 100, 'due_date' => now()->addWeek(), 'status' => 'open']);
        $ownGuardian = Guardian::create(['organization_id' => $org->id, 'name' => 'Own Family', 'user_id' => $parent->id]);
        $ownInvoice = Invoice::create(['organization_id' => $org->id, 'guardian_id' => $ownGuardian->id, 'invoice_number' => 'INV-OWN', 'amount' => 50, 'due_date' => now()->addWeek(), 'status' => 'open']);

        $this->actingAs($parent, 'sanctum')->getJson("/api/billing/invoices/{$otherInvoice->id}")->assertForbidden();
        $this->actingAs($parent, 'sanctum')->getJson("/api/billing/invoices/{$ownInvoice->id}")->assertOk();
    }

    public function test_classroom_staff_cannot_view_or_edit_an_incident_from_another_classroom(): void
    {
        [$org, $staff] = $this->activeOrganization('staff');
        $ownRoom = Classroom::create(['organization_id' => $org->id, 'name' => 'Own Room']);
        $otherRoom = Classroom::create(['organization_id' => $org->id, 'name' => 'Other Room']);
        StaffProfile::create(['organization_id' => $org->id, 'user_id' => $staff->id, 'classroom_id' => $ownRoom->id]);
        $otherChild = Child::create(['organization_id' => $org->id, 'classroom_id' => $otherRoom->id, 'first_name' => 'Other', 'last_name' => 'Room', 'status' => 'active']);
        $incident = IncidentReport::create(['organization_id' => $org->id, 'child_id' => $otherChild->id, 'classroom_id' => $otherRoom->id, 'severity' => 'low', 'status' => 'draft', 'summary' => 'Scraped knee', 'occurred_at' => now()]);

        $this->actingAs($staff, 'sanctum')->getJson("/api/incidents/{$incident->id}")->assertForbidden();
        $this->actingAs($staff, 'sanctum')->putJson("/api/incidents/{$incident->id}", ['summary' => 'Edited'])->assertForbidden();
        $this->assertSame('Scraped knee', $incident->fresh()->summary);
    }

    // --- Managers cannot take over the daycare admin account ---

    public function test_a_manager_cannot_change_a_daycare_admins_email_status_role_or_pin(): void
    {
        [$org, $manager] = $this->activeOrganization('manager');
        $admin = User::factory()->create(['organization_id' => $org->id, 'role' => 'daycare_admin', 'status' => 'active', 'email' => 'owner@example.test']);

        $this->actingAs($manager, 'sanctum')->putJson("/api/users/{$admin->id}", ['email' => 'attacker@example.test'])->assertForbidden();
        $this->actingAs($manager, 'sanctum')->postJson("/api/users/{$admin->id}/status", ['status' => 'blocked'])->assertForbidden();
        $this->actingAs($manager, 'sanctum')->postJson("/api/users/{$admin->id}/assign-role", ['role' => 'staff'])->assertForbidden();
        $this->actingAs($manager, 'sanctum')->postJson("/api/staff/{$admin->id}/reset-pin", ['pin' => '1111'])->assertForbidden();
        $this->actingAs($manager, 'sanctum')->patchJson("/api/staff/{$admin->id}/deactivate")->assertForbidden();

        $admin->refresh();
        $this->assertSame('owner@example.test', $admin->email);
        $this->assertSame('active', $admin->status);
        $this->assertSame('daycare_admin', $admin->role);
    }

    public function test_a_manager_can_still_manage_regular_staff_and_an_admin_can_manage_admins(): void
    {
        [$org, $manager] = $this->activeOrganization('manager');
        $staff = User::factory()->create(['organization_id' => $org->id, 'role' => 'staff', 'status' => 'active']);
        $admin = User::factory()->create(['organization_id' => $org->id, 'role' => 'daycare_admin', 'status' => 'active']);
        $otherAdmin = User::factory()->create(['organization_id' => $org->id, 'role' => 'daycare_admin', 'status' => 'active']);

        $this->actingAs($manager, 'sanctum')->patchJson("/api/staff/{$staff->id}/deactivate")->assertOk();
        $this->actingAs($admin, 'sanctum')->postJson("/api/users/{$otherAdmin->id}/status", ['status' => 'inactive'])->assertOk();
    }

    // --- PIN verification is single use ---

    public function test_a_pin_verification_cannot_be_used_for_two_attendance_actions(): void
    {
        [$org, $admin] = $this->activeOrganization('daycare_admin');
        $org->update(['latitude' => 40.0, 'longitude' => -75.0, 'attendance_radius_meters' => 200]);
        $childOne = Child::create(['organization_id' => $org->id, 'first_name' => 'One', 'last_name' => 'Kid', 'status' => 'active']);
        $childTwo = Child::create(['organization_id' => $org->id, 'first_name' => 'Two', 'last_name' => 'Kid', 'status' => 'active']);
        $log = PinVerificationLog::create(['user_id' => $admin->id, 'organization_id' => $org->id, 'email' => $admin->email, 'success' => true, 'purpose' => 'tablet_signer:user:'.$admin->id, 'verified_at' => now()]);
        $payload = fn (Child $child) => ['child_id' => $child->id, 'signer_type' => 'staff', 'verification_method' => 'pin', 'pin_verification_id' => $log->id, 'latitude' => 40.0, 'longitude' => -75.0];

        $this->actingAs($admin, 'sanctum')->postJson('/api/attendance/check-in', $payload($childOne))->assertCreated();
        $this->actingAs($admin, 'sanctum')->postJson('/api/attendance/check-in', $payload($childTwo))->assertStatus(422);
        $this->assertDatabaseMissing('attendance_records', ['child_id' => $childTwo->id]);
    }

    // --- Stripe: replayed / stale sessions and double settlement ---

    public function test_replaying_an_already_recorded_paid_session_does_not_settle_a_new_invoice(): void
    {
        [$org, $admin] = $this->activeOrganization('daycare_admin');
        $subscription = Subscription::where('organization_id', $org->id)->first();
        $subscription->update(['status' => 'past_due']);
        $oldInvoice = $this->platformInvoice($org, $subscription, 'paid');
        PlatformPayment::create(['organization_id' => $org->id, 'invoice_id' => $oldInvoice->id, 'amount' => 49, 'method' => 'stripe_live', 'reference' => 'pi_last_month', 'paid_at' => now()->subMonth()]);
        $newInvoice = $this->platformInvoice($org, $subscription, 'overdue');

        $this->stubStripeSession($this->paidSession($org, $subscription, $newInvoice, ['payment_intent' => 'pi_last_month']));

        $this->actingAs($admin, 'sanctum')->postJson('/api/daycare/billing/stripe/confirm-session', ['session_id' => 'cs_replay'])->assertOk();

        $this->assertSame('overdue', $newInvoice->fresh()->status);
        $this->assertSame('past_due', $subscription->fresh()->status);
        $this->assertSame(1, PlatformPayment::where('reference', 'pi_last_month')->count());
    }

    public function test_a_stale_checkout_session_is_not_settled_by_confirm_session(): void
    {
        [$org, $admin] = $this->activeOrganization('daycare_admin');
        $subscription = Subscription::where('organization_id', $org->id)->first();
        $subscription->update(['status' => 'past_due']);
        $invoice = $this->platformInvoice($org, $subscription, 'overdue');

        $this->stubStripeSession($this->paidSession($org, $subscription, $invoice, ['payment_intent' => 'pi_stale', 'created' => now()->subDays(3)->getTimestamp()]));

        $this->actingAs($admin, 'sanctum')->postJson('/api/daycare/billing/stripe/confirm-session', ['session_id' => 'cs_stale'])->assertOk();

        $this->assertSame('overdue', $invoice->fresh()->status);
        $this->assertSame('past_due', $subscription->fresh()->status);
    }

    public function test_a_fresh_paid_session_settles_exactly_one_invoice_and_activates_the_subscription(): void
    {
        [$org, $admin] = $this->activeOrganization('daycare_admin');
        $subscription = Subscription::where('organization_id', $org->id)->first();
        $subscription->update(['status' => 'pending_payment']);
        $paidFor = $this->platformInvoice($org, $subscription, 'open', now()->addDays(3));
        $otherOpen = $this->platformInvoice($org, $subscription, 'open', now()->addDays(10));

        $this->stubStripeSession($this->paidSession($org, $subscription, $paidFor, ['payment_intent' => 'pi_fresh']));

        $this->actingAs($admin, 'sanctum')->postJson('/api/daycare/billing/stripe/confirm-session', ['session_id' => 'cs_fresh'])
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertSame('paid', $paidFor->fresh()->status);
        $this->assertSame('open', $otherOpen->fresh()->status, 'One Stripe payment must not settle a second invoice.');
        $this->assertSame('active', $subscription->fresh()->status);
        $this->assertSame(1, PlatformPayment::where('provider_payment_id', 'pi_fresh')->orWhere('reference', 'pi_fresh')->count());

        // Confirming the same session again (page refresh) is an idempotent no-op.
        $this->actingAs($admin, 'sanctum')->postJson('/api/daycare/billing/stripe/confirm-session', ['session_id' => 'cs_fresh'])->assertOk();
        $this->assertSame(1, PlatformPayment::where('provider_payment_id', 'pi_fresh')->orWhere('reference', 'pi_fresh')->count());
        $this->assertSame('open', $otherOpen->fresh()->status);
    }

    public function test_the_payment_intent_webhook_after_confirm_does_not_record_a_second_payment(): void
    {
        [$org, $admin] = $this->activeOrganization('daycare_admin');
        $subscription = Subscription::where('organization_id', $org->id)->first();
        $invoice = $this->platformInvoice($org, $subscription, 'open');
        $this->platformInvoice($org, $subscription, 'open', now()->addDays(20));

        $this->stubStripeSession($this->paidSession($org, $subscription, $invoice, ['payment_intent' => 'pi_both_paths']));
        $this->actingAs($admin, 'sanctum')->postJson('/api/daycare/billing/stripe/confirm-session', ['session_id' => 'cs_both'])->assertOk();

        $event = \Stripe\Event::constructFrom([
            'id' => 'evt_pi_both',
            'type' => 'payment_intent.succeeded',
            'data' => ['object' => ['id' => 'pi_both_paths', 'amount_received' => 4900, 'metadata' => ['invoice_id' => (string) $invoice->id, 'organization_id' => (string) $org->id]]],
        ]);
        $this->mock(\App\Services\StripeService::class, function ($mock) use ($event) {
            $mock->shouldReceive('isConfigured')->andReturn(true);
            $mock->shouldReceive('constructWebhookEvent')->andReturn($event);
        });
        $this->postJson('/api/webhooks/stripe', [], ['Stripe-Signature' => 'test'])->assertOk();

        $this->assertSame(1, PlatformPayment::where('organization_id', $org->id)->count());
    }

    public function test_subscription_updated_webhook_reads_the_period_from_subscription_items(): void
    {
        [$org] = $this->activeOrganization('daycare_admin');
        $subscription = Subscription::where('organization_id', $org->id)->first();
        $subscription->update(['stripe_subscription_id' => 'sub_items_period', 'status' => 'past_due']);
        $start = now()->startOfSecond();
        $end = now()->addDays(30)->startOfSecond();

        $event = \Stripe\Event::constructFrom([
            'id' => 'evt_sub_updated',
            'type' => 'customer.subscription.updated',
            'data' => ['object' => [
                'id' => 'sub_items_period',
                'status' => 'active',
                'items' => ['data' => [['current_period_start' => $start->getTimestamp(), 'current_period_end' => $end->getTimestamp()]]],
            ]],
        ]);
        $this->mock(\App\Services\StripeService::class, function ($mock) use ($event) {
            $mock->shouldReceive('isConfigured')->andReturn(true);
            $mock->shouldReceive('constructWebhookEvent')->andReturn($event);
        });

        $this->postJson('/api/webhooks/stripe', [], ['Stripe-Signature' => 'test'])->assertOk();

        $fresh = $subscription->fresh();
        $this->assertSame('active', $fresh->status);
        $this->assertSame($end->getTimestamp(), $fresh->current_period_end->getTimestamp());
        $this->assertSame($end->getTimestamp(), $fresh->current_period_ends_at->getTimestamp());
    }

    // --- Production-only safety guards ---

    public function test_test_payment_success_is_unavailable_in_production_even_when_flagged_on(): void
    {
        [$org, $admin] = $this->activeOrganization('daycare_admin');
        $subscription = Subscription::where('organization_id', $org->id)->first();
        $invoice = $this->platformInvoice($org, $subscription, 'open');
        config(['services.billing.test_payment_enabled' => true]);
        $this->app['env'] = 'production';

        $this->actingAs($admin, 'sanctum')->postJson('/api/daycare/billing/test-payment-success')->assertForbidden();

        $this->assertSame('open', $invoice->fresh()->status);
    }

    public function test_demo_reset_refuses_to_run_in_production(): void
    {
        $this->app['env'] = 'production';

        $this->artisan('barbaari:demo-reset')->assertFailed();

        $this->assertDatabaseMissing('users', ['email' => 'super@barbaari.test']);
    }

    public function test_password_reset_revokes_existing_api_tokens(): void
    {
        [, $admin] = $this->activeOrganization('daycare_admin');
        $admin->createToken('old-session');
        $token = Password::createToken($admin);

        $this->postJson('/api/auth/reset-password', [
            'token' => $token,
            'email' => $admin->email,
            'password' => 'new-password-123',
            'password_confirmation' => 'new-password-123',
        ])->assertOk();

        $this->assertSame(0, $admin->tokens()->count());
    }

    public function test_uploaded_document_stores_the_server_detected_mime_type(): void
    {
        Storage::fake(config('filesystems.default', 'local'));
        [, $admin] = $this->activeOrganization('daycare_admin');
        // A real temp file (not UploadedFile::fake(), whose getMimeType() just echoes the
        // forced type) so the client-declared text/html differs from what finfo detects.
        $path = tempnam(sys_get_temp_dir(), 'doc');
        file_put_contents($path, 'plain text notes');
        $file = new UploadedFile($path, 'notes.txt', 'text/html', null, true);

        $response = $this->actingAs($admin, 'sanctum')->post('/api/documents', ['title' => 'Notes', 'file' => $file], ['Accept' => 'application/json']);

        $response->assertCreated();
        $this->assertSame('text/plain', $response->json('document.mime_type'));
    }

    // --- In-app account deletion (App Store 5.1.1(v)) ---

    public function test_a_parent_can_delete_their_own_account_with_their_password(): void
    {
        [$org, $parent] = $this->activeOrganization('parent');
        $parent->update(['password' => Hash::make('parent-pass-1')]);
        $guardian = Guardian::create(['organization_id' => $org->id, 'name' => 'Parent Guardian', 'user_id' => $parent->id]);
        $parent->createToken('mobile');

        $this->actingAs($parent, 'sanctum')->deleteJson('/api/auth/account', ['password' => 'wrong'])->assertUnprocessable();
        $this->assertDatabaseHas('users', ['id' => $parent->id]);

        $this->actingAs($parent, 'sanctum')->deleteJson('/api/auth/account', ['password' => 'parent-pass-1'])->assertOk();

        $this->assertDatabaseMissing('users', ['id' => $parent->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $parent->id]);
        $this->assertNull($guardian->fresh()->user_id, 'The daycare guardian record is kept, just unlinked.');
    }

    public function test_an_unlinked_self_registered_parent_can_delete_their_account(): void
    {
        $this->postJson('/api/auth/register', ['name' => 'Solo', 'email' => 'solo@example.test', 'password' => 'solo-pass-1'])->assertCreated();
        $user = User::where('email', 'solo@example.test')->firstOrFail();

        $this->actingAs($user, 'sanctum')->deleteJson('/api/auth/account', ['password' => 'solo-pass-1'])->assertOk();

        $this->assertDatabaseMissing('users', ['email' => 'solo@example.test']);
    }

    public function test_staff_and_admin_accounts_cannot_self_delete(): void
    {
        [, $admin] = $this->activeOrganization('daycare_admin');
        $admin->update(['password' => Hash::make('admin-pass-1')]);

        $this->actingAs($admin, 'sanctum')->deleteJson('/api/auth/account', ['password' => 'admin-pass-1'])->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $admin->id]);
    }

    // --- helpers ---

    private function activeOrganization(string $role = 'daycare_admin', string $facilityType = 'center_daycare'): array
    {
        $plan = PricingPlan::create([
            'name' => 'Starter',
            'code' => 'starter-hardening-'.Str::random(8),
            'monthly_price' => 49,
            'yearly_price' => 490,
            'status' => 'active',
            'available_for_family_child_care' => true,
            'available_for_center_daycare' => true,
        ]);
        $organization = Organization::create([
            'name' => 'Hardening Org '.Str::random(6),
            'organization_code' => 'HRD'.random_int(10000, 99999),
            'facility_type' => $facilityType,
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
        $user = User::factory()->create(['organization_id' => $organization->id, 'role' => $role, 'status' => 'active']);

        return [$organization, $user];
    }

    private function platformInvoice(Organization $org, Subscription $subscription, string $status, $dueDate = null): PlatformInvoice
    {
        $paid = $status === 'paid';

        return PlatformInvoice::create([
            'organization_id' => $org->id,
            'subscription_id' => $subscription->id,
            'invoice_number' => 'PLAT-TEST-'.Str::upper(Str::random(8)),
            'due_date' => ($dueDate ?? ($status === 'overdue' ? now()->subDays(2) : now()->addDays(5)))->toDateString(),
            'currency' => 'USD',
            'subtotal' => 49,
            'total_amount' => 49,
            'amount_paid' => $paid ? 49 : 0,
            'balance_due' => $paid ? 0 : 49,
            'status' => $status,
        ]);
    }

    private function paidSession(Organization $org, Subscription $subscription, PlatformInvoice $invoice, array $overrides = []): object
    {
        return (object) array_merge([
            'id' => 'cs_'.Str::random(10),
            'payment_status' => 'paid',
            'created' => now()->getTimestamp(),
            'amount_total' => 4900,
            'customer' => 'cus_test',
            'payment_intent' => 'pi_'.Str::random(10),
            'invoice' => null,
            'subscription' => null,
            'metadata' => (object) [
                'organization_id' => (string) $org->id,
                'subscription_id' => (string) $subscription->id,
                'invoice_id' => (string) $invoice->id,
                'mode' => 'platform_billing',
            ],
        ], $overrides);
    }

    private function stubStripeSession(object $session): void
    {
        $sessionsStub = \Mockery::mock();
        $sessionsStub->shouldReceive('retrieve')->andReturn($session);
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
    }
}
