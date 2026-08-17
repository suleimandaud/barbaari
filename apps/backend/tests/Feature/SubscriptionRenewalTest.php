<?php

namespace Tests\Feature;

use App\Models\Organization;
use App\Models\PlatformInvoice;
use App\Models\PricingPlan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\SubscriptionAccessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * A paid invoice must advance an expired subscription's billing period — otherwise the
 * organization can pay indefinitely and never regain access, because
 * SubscriptionAccessService::requiresPayment() (correctly) keeps gating on the date, not
 * just the status column. These tests exercise the real HTTP endpoint
 * (POST /daycare/billing/test-payment-success) that production code actually calls, not
 * just the model method in isolation, so they prove the full integration works.
 */
class SubscriptionRenewalTest extends TestCase
{
    use RefreshDatabase;

    public function test_paying_an_expired_monthly_subscription_renews_it_for_exactly_thirty_days_and_lifts_the_gate(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-17 12:00:00'));

        try {
            [, $admin, $subscription, $invoice] = $this->fixture('monthly', Carbon::parse('2026-07-01'), Carbon::parse('2026-08-01'));

            $this->actingAs($admin, 'sanctum')
                ->postJson('/api/daycare/billing/test-payment-success')
                ->assertOk()
                ->assertJsonPath('subscription.status', 'active');

            $subscription->refresh();
            $invoice->refresh();

            $this->assertSame('paid', $invoice->status);
            $this->assertSame('2026-08-17 12:00:00', $subscription->current_period_start->toDateTimeString());
            $this->assertSame('2026-09-16 12:00:00', $subscription->current_period_end->toDateTimeString());
            $this->assertSame('2026-09-16 12:00:00', $subscription->current_period_ends_at->toDateTimeString());
            $this->assertEqualsWithDelta(30, $subscription->current_period_start->diffInDays($subscription->current_period_end), 0.0);

            $service = app(SubscriptionAccessService::class);
            $this->assertFalse($service->requiresPayment($subscription));
            $this->assertSame('active', $service->getPaymentGateReason($subscription)['subscription_status']);
            $this->assertFalse($service->getPaymentGateReason($subscription)['requires_payment']);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_paying_an_expired_yearly_subscription_renews_it_for_one_calendar_year_and_lifts_the_gate(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-17 12:00:00'));

        try {
            [, $admin, $subscription, $invoice] = $this->fixture('yearly', Carbon::parse('2025-06-01'), Carbon::parse('2026-06-01'));

            $this->actingAs($admin, 'sanctum')
                ->postJson('/api/daycare/billing/test-payment-success')
                ->assertOk();

            $subscription->refresh();
            $invoice->refresh();

            $this->assertSame('paid', $invoice->status);
            $this->assertSame('2026-08-17 12:00:00', $subscription->current_period_start->toDateTimeString());
            $this->assertSame('2027-08-17 12:00:00', $subscription->current_period_end->toDateTimeString());

            $service = app(SubscriptionAccessService::class);
            $this->assertFalse($service->requiresPayment($subscription));
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_paying_an_invoice_for_a_subscription_that_is_not_yet_expired_does_not_shorten_its_existing_period(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-17 12:00:00'));

        try {
            // Still has three weeks of already-paid access remaining.
            $futureEnd = Carbon::parse('2026-09-07 12:00:00');
            [, $admin, $subscription, $invoice] = $this->fixture('monthly', Carbon::parse('2026-08-10'), $futureEnd);

            $this->actingAs($admin, 'sanctum')
                ->postJson('/api/daycare/billing/test-payment-success')
                ->assertOk();

            $subscription->refresh();
            $invoice->refresh();

            $this->assertSame('paid', $invoice->status);
            // Untouched — never shortened, and not arbitrarily extended either.
            $this->assertSame('2026-09-07 12:00:00', $subscription->current_period_end->toDateTimeString());
            $this->assertSame('2026-09-07 12:00:00', $subscription->current_period_ends_at->toDateTimeString());

            $service = app(SubscriptionAccessService::class);
            $this->assertFalse($service->requiresPayment($subscription));
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_after_renewal_a_real_subscription_gated_endpoint_grants_access_instead_of_402(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-17 12:00:00'));

        try {
            [, $admin, ,] = $this->fixture('monthly', Carbon::parse('2026-07-01'), Carbon::parse('2026-08-01'));

            // Confirm the gate is actually closed before paying — otherwise this test
            // wouldn't be proving anything.
            $this->actingAs($admin, 'sanctum')
                ->getJson('/api/manager/dashboard')
                ->assertStatus(402);

            $this->actingAs($admin, 'sanctum')
                ->postJson('/api/daycare/billing/test-payment-success')
                ->assertOk();

            $this->actingAs($admin, 'sanctum')
                ->getJson('/api/manager/dashboard')
                ->assertOk();
        } finally {
            Carbon::setTestNow();
        }
    }

    /**
     * @return array{0: Organization, 1: User, 2: Subscription, 3: PlatformInvoice}
     */
    private function fixture(string $billingCycle, Carbon $periodStart, Carbon $periodEnd): array
    {
        $plan = PricingPlan::create([
            'name' => 'Growth',
            'code' => 'growth-'.uniqid(),
            'monthly_price' => 349,
            'yearly_price' => 3490,
            'status' => 'active',
            'featured' => false,
            'available_for_family_child_care' => true,
            'available_for_center_daycare' => true,
        ]);
        $organization = Organization::create([
            'name' => 'Renewal Test Org '.uniqid(),
            'organization_code' => 'REN'.random_int(10000, 99999),
            'facility_type' => 'center_daycare',
            'status' => 'active',
            'approved_at' => now(),
            'plan' => 'Growth',
        ]);
        $subscription = Subscription::create([
            'organization_id' => $organization->id,
            'pricing_plan_id' => $plan->id,
            'billing_cycle' => $billingCycle,
            'status' => 'active',
            'provider' => 'manual',
            'current_period_start' => $periodStart,
            'current_period_end' => $periodEnd,
            'current_period_ends_at' => $periodEnd,
        ]);
        $invoice = PlatformInvoice::create([
            'organization_id' => $organization->id,
            'subscription_id' => $subscription->id,
            'invoice_number' => 'PLAT-TEST-'.uniqid(),
            'billing_period_start' => $periodStart->toDateString(),
            'billing_period_end' => $periodEnd->toDateString(),
            'due_date' => $periodEnd->copy()->addDays(7)->toDateString(),
            'currency' => 'USD',
            'subtotal' => $billingCycle === 'yearly' ? 3490 : 349,
            'total_amount' => $billingCycle === 'yearly' ? 3490 : 349,
            'amount_paid' => 0,
            'balance_due' => $billingCycle === 'yearly' ? 3490 : 349,
            'status' => 'open',
            'payment_method' => 'manual',
        ]);
        $admin = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => 'daycare_admin',
            'status' => 'active',
        ]);

        return [$organization, $admin, $subscription, $invoice];
    }
}
