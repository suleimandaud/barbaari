<?php

namespace Tests\Feature;

use App\Models\Child;
use App\Models\Organization;
use App\Models\PricingPlan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\SubscriptionAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The backend is the authoritative enforcement layer for subscription access: a
 * subscription's status field is only ever updated by an external event (a Stripe
 * webhook, a manual status change), so nothing flips it the instant a 30-day period
 * elapses. SubscriptionAccessService::requiresPayment() must therefore treat the
 * recorded period end as the real expiration check, not just the status column — and
 * every authenticated route, including the tablet/kiosk endpoints, sits behind that same
 * check via the `subscription.active` middleware. These tests exercise that gate both
 * directly and over HTTP so a client can never bypass it by calling the API straight.
 */
class SubscriptionAccessEnforcementTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_subscription_with_future_period_end_allows_access(): void
    {
        $service = app(SubscriptionAccessService::class);
        [, , $subscription] = $this->fixture(now()->subDays(5), now()->addDays(25));

        $this->assertFalse($service->requiresPayment($subscription));
    }

    public function test_active_subscription_with_past_period_end_requires_payment_even_though_status_is_still_active(): void
    {
        $service = app(SubscriptionAccessService::class);
        // Status was never flipped by a webhook/cron — only the recorded period end has
        // elapsed. This is exactly the gap the backend must close on its own.
        [, , $subscription] = $this->fixture(now()->subDays(40), now()->subDays(10));

        $this->assertSame('active', $subscription->status);
        $this->assertTrue($service->requiresPayment($subscription));
    }

    public function test_subscription_with_no_recorded_period_end_is_not_treated_as_expired(): void
    {
        // Legacy/manually-granted subscriptions without period tracking must keep working
        // exactly as before — this only starts enforcing once a period end is recorded.
        $service = app(SubscriptionAccessService::class);
        [, , $subscription] = $this->fixture(null, null);

        $this->assertFalse($service->requiresPayment($subscription));
    }

    public function test_tablet_request_with_active_subscription_is_allowed(): void
    {
        [, $admin] = $this->fixture(now()->subDays(5), now()->addDays(25));

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/tablet/bootstrap?mode=admin')
            ->assertOk();
    }

    public function test_tablet_request_with_expired_subscription_is_rejected_by_backend(): void
    {
        [, $admin] = $this->fixture(now()->subDays(40), now()->subDays(10));

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/tablet/bootstrap?mode=admin')
            ->assertStatus(402)
            ->assertJsonPath('requires_payment', true);
    }

    public function test_tablet_write_endpoints_are_also_rejected_once_expired_not_just_bootstrap(): void
    {
        [$organization, $admin, ] = $this->fixture(now()->subDays(40), now()->subDays(10));
        $child = Child::create([
            'organization_id' => $organization->id,
            'first_name' => 'Blocked',
            'last_name' => 'Child',
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/tablet/attendance/guardian-check-in', [
                'child_id' => $child->id,
                'signer_type' => 'staff',
                'assisting_staff_id' => $admin->id,
                'signer_name' => $admin->name,
                'verification_method' => 'pin',
                'signature_name' => $admin->name,
            ])
            ->assertStatus(402);
    }

    public function test_boundary_at_the_exact_expiration_instant_is_handled_consistently(): void
    {
        $service = app(SubscriptionAccessService::class);
        Carbon::setTestNow(Carbon::parse('2026-08-15 12:00:00'));

        try {
            [, , $subscription] = $this->fixture(now()->subDays(30), now());

            // At the exact instant current_period_end equals "now", the period has not
            // yet moved into the past (Carbon::isPast() is strict) — access is still
            // allowed, matching the trial_ends_at boundary convention already used
            // elsewhere in this service.
            $this->assertFalse($service->requiresPayment($subscription->fresh()));

            // One second later, the same subscription (status untouched) must be denied.
            Carbon::setTestNow(Carbon::parse('2026-08-15 12:00:01'));
            $this->assertTrue($service->requiresPayment($subscription->fresh()));
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_renewal_creates_the_next_thirty_day_period_from_the_prior_period_end(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-01-31 09:00:00'));

        try {
            [, , $subscription] = $this->fixture(now()->subDays(30), now());
            $priorEnd = $subscription->current_period_end->copy();

            $renewedEnd = Subscription::periodEnd($subscription->billing_cycle, $priorEnd);
            $subscription->update([
                'current_period_start' => $priorEnd,
                'current_period_end' => $renewedEnd,
                'current_period_ends_at' => $renewedEnd,
            ]);

            $this->assertEqualsWithDelta(30, $priorEnd->diffInDays($renewedEnd), 0.0);
            $this->assertTrue($renewedEnd->isAfter($priorEnd));
        } finally {
            Carbon::setTestNow();
        }
    }

    /**
     * @return array{0: Organization, 1: User, 2: Subscription}
     */
    private function fixture(?Carbon $periodStart, ?Carbon $periodEnd): array
    {
        $plan = PricingPlan::create([
            'name' => 'Starter',
            'code' => 'starter-'.uniqid(),
            'monthly_price' => 49,
            'yearly_price' => 490,
            'status' => 'active',
            'featured' => false,
            'available_for_family_child_care' => true,
            'available_for_center_daycare' => true,
        ]);
        $organization = Organization::create([
            'name' => 'Access Enforcement Org '.uniqid(),
            'organization_code' => 'ACC'.random_int(10000, 99999),
            'facility_type' => 'center_daycare',
            'status' => 'active',
            'approved_at' => now(),
            'plan' => 'Starter',
            'latitude' => 38.8977,
            'longitude' => -77.0365,
            'attendance_radius_meters' => 100,
            'checkin_radius_meters' => 100,
        ]);
        $subscription = Subscription::create([
            'organization_id' => $organization->id,
            'pricing_plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
            'status' => 'active',
            'provider' => 'manual',
            'current_period_start' => $periodStart,
            'current_period_end' => $periodEnd,
            'current_period_ends_at' => $periodEnd,
        ]);
        $admin = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => 'daycare_admin',
            'status' => 'active',
        ]);

        return [$organization, $admin, $subscription];
    }
}
