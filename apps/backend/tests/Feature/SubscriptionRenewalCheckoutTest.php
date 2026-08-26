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
 * createStripeCheckoutSession() must auto-generate a renewal invoice for an expired
 * subscription that has none on record — otherwise the customer can never reach Stripe
 * at all (see ApiController::ensureSubscriptionInvoice(), the canonical invoice-generation
 * method reused here, unchanged, exactly as generateOrgInvoice() already does). These
 * tests mock App\Services\StripeService directly (the same pattern already used in
 * SecurityHardeningTest for Stripe-touching endpoints), so no real network call is made.
 */
class SubscriptionRenewalCheckoutTest extends TestCase
{
    use RefreshDatabase;

    private function mockOneTimeCheckout(): void
    {
        // This machine's real local .env legitimately has STRIPE_PRICE_ID set (for actual
        // local development against Stripe test mode), and phpunit.xml does not override
        // it the way it does DB_CONNECTION/DB_DATABASE — so it otherwise leaks into every
        // test run here. Force it off explicitly so these tests deterministically exercise
        // the one-time-checkout branch regardless of the developer's local environment.
        config(['services.stripe.price_id' => null]);

        $this->mock(\App\Services\StripeService::class, function ($mock) {
            $mock->shouldReceive('isConfigured')->andReturn(true);
            // createOneTimeCheckout() is declared `: CheckoutSession` — Mockery's partial
            // mock still enforces that real return type, so a bare stdClass fails with a
            // TypeError. Stripe SDK objects are built via their own constructFrom(), the
            // same factory already used for \Stripe\Event in SecurityHardeningTest.
            $mock->shouldReceive('createOneTimeCheckout')->andReturn(\Stripe\Checkout\Session::constructFrom([
                'id' => 'cs_test_one_time_123',
                'url' => 'https://checkout.stripe.com/test_one_time_123',
                'payment_intent' => 'pi_test_123',
            ]));
        });
    }

    public function test_expired_subscription_with_no_invoice_gets_exactly_one_renewal_invoice_and_a_checkout_session(): void
    {
        $this->mockOneTimeCheckout();
        [$organization, $admin, $subscription] = $this->fixture(expired: true, createInvoice: false);

        $this->assertSame(0, PlatformInvoice::where('organization_id', $organization->id)->count());

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/daycare/billing/stripe/create-checkout-session')
            ->assertOk()
            ->assertJsonPath('checkout_url', 'https://checkout.stripe.com/test_one_time_123')
            ->assertJsonPath('session_id', 'cs_test_one_time_123');

        $this->assertSame(1, PlatformInvoice::where('organization_id', $organization->id)->count());
        $invoice = PlatformInvoice::where('organization_id', $organization->id)->first();
        $this->assertSame($subscription->id, $invoice->subscription_id);
        $this->assertSame('open', $invoice->status);
        $this->assertEqualsWithDelta(99.0, (float) $invoice->total_amount, 0.001);
        $this->assertSame('pi_test_123', $invoice->fresh()->stripe_payment_intent_id);
    }

    public function test_expired_subscription_with_an_existing_unpaid_invoice_reuses_it_instead_of_creating_another(): void
    {
        $this->mockOneTimeCheckout();
        [$organization, $admin, , $existingInvoice] = $this->fixture(expired: true, createInvoice: true);

        $this->assertSame(1, PlatformInvoice::where('organization_id', $organization->id)->count());

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/daycare/billing/stripe/create-checkout-session')
            ->assertOk()
            ->assertJsonPath('checkout_url', 'https://checkout.stripe.com/test_one_time_123');

        $this->assertSame(1, PlatformInvoice::where('organization_id', $organization->id)->count());
        $this->assertSame($existingInvoice->id, PlatformInvoice::where('organization_id', $organization->id)->first()->id);
        $this->assertSame('pi_test_123', $existingInvoice->fresh()->stripe_payment_intent_id);
    }

    public function test_active_non_expired_subscription_does_not_get_a_renewal_invoice_merely_by_calling_checkout(): void
    {
        [$organization, $admin] = $this->fixture(expired: false, createInvoice: false);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/daycare/billing/stripe/create-checkout-session')
            ->assertStatus(422)
            ->assertJsonPath('message', 'No unpaid platform invoice is available for checkout.');

        $this->assertSame(0, PlatformInvoice::where('organization_id', $organization->id)->count());
    }

    public function test_after_checkout_auto_creates_the_invoice_a_successful_payment_still_renews_the_period_and_lifts_the_gate(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-17 12:00:00'));

        try {
            $this->mockOneTimeCheckout();
            [$organization, $admin, $subscription] = $this->fixture(expired: true, createInvoice: false);

            // Step 1: checkout auto-generates the renewal invoice (the fix under test).
            $this->actingAs($admin, 'sanctum')
                ->postJson('/api/daycare/billing/stripe/create-checkout-session')
                ->assertOk();

            // Step 2: the existing, unmodified payment-completion flow (test-payment
            // stands in for a completed Stripe payment here — same code path as real
            // Stripe, per recalculatePlatformInvoice()) must still renew the period.
            $this->actingAs($admin, 'sanctum')
                ->postJson('/api/daycare/billing/test-payment-success')
                ->assertOk();

            $subscription->refresh();
            $this->assertSame('2026-08-17 12:00:00', $subscription->current_period_start->toDateTimeString());
            $this->assertSame('2026-09-16 12:00:00', $subscription->current_period_end->toDateTimeString());

            $service = app(SubscriptionAccessService::class);
            $this->assertFalse($service->requiresPayment($subscription));
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_stripe_subscription_checkout_is_used_unchanged_when_a_stripe_price_id_is_configured(): void
    {
        config(['services.stripe.price_id' => 'price_test_configured']);
        [$organization, $admin] = $this->fixture(expired: true, createInvoice: false);

        $this->mock(\App\Services\StripeService::class, function ($mock) {
            $mock->shouldReceive('isConfigured')->andReturn(true);
            // Deliberately NOT stubbing createOneTimeCheckout — if the endpoint called it
            // instead of createSubscriptionCheckout, Mockery would fail with an
            // unexpected-method-call error, proving the one-time path was not used.
            $mock->shouldReceive('createSubscriptionCheckout')->andReturn(\Stripe\Checkout\Session::constructFrom([
                'id' => 'cs_test_subscription_mode_123',
                'url' => 'https://checkout.stripe.com/test_subscription_mode_123',
            ]));
        });

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/daycare/billing/stripe/create-checkout-session')
            ->assertOk()
            ->assertJsonPath('checkout_url', 'https://checkout.stripe.com/test_subscription_mode_123');

        // The renewal invoice is still generated (the shared gate above both branches
        // required one before and after this fix) — this fix does not change that.
        $this->assertSame(1, PlatformInvoice::where('organization_id', $organization->id)->count());
    }

    public function test_an_organization_can_never_create_or_reuse_another_organizations_invoice_via_checkout(): void
    {
        $this->mockOneTimeCheckout();
        [$orgA, $adminA] = $this->fixture(expired: true, createInvoice: false);
        [$orgB, , , $invoiceB] = $this->fixture(expired: true, createInvoice: true);

        $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/daycare/billing/stripe/create-checkout-session')
            ->assertOk();

        // Org A got its own invoice...
        $this->assertSame(1, PlatformInvoice::where('organization_id', $orgA->id)->count());
        // ...and org B's pre-existing invoice was never touched, claimed, or reused by A.
        $this->assertNull($invoiceB->fresh()->stripe_payment_intent_id);
        $this->assertSame(1, PlatformInvoice::where('organization_id', $orgB->id)->count());
        $this->assertNotSame(
            $invoiceB->id,
            PlatformInvoice::where('organization_id', $orgA->id)->first()->id
        );
    }

    /**
     * @return array{0: Organization, 1: User, 2: Subscription, 3: ?PlatformInvoice}
     */
    private function fixture(bool $expired, bool $createInvoice): array
    {
        $plan = PricingPlan::create([
            'name' => 'Starter',
            'code' => 'starter-'.uniqid(),
            'monthly_price' => 99,
            'yearly_price' => 990,
            'status' => 'active',
            'featured' => false,
            'available_for_family_child_care' => true,
            'available_for_center_daycare' => true,
        ]);
        $organization = Organization::create([
            'name' => 'My House '.uniqid(),
            'organization_code' => 'MH'.random_int(10000, 99999),
            'facility_type' => 'family_child_care',
            'status' => 'active',
            'approved_at' => now(),
            'plan' => 'Starter',
        ]);
        $periodEnd = $expired ? now()->subDays(5) : now()->addDays(20);
        $subscription = Subscription::create([
            'organization_id' => $organization->id,
            'pricing_plan_id' => $plan->id,
            'billing_cycle' => 'monthly',
            'status' => 'active',
            'provider' => 'manual',
            'current_period_start' => $periodEnd->copy()->subDays(30),
            'current_period_end' => $periodEnd,
            'current_period_ends_at' => $periodEnd,
        ]);
        $invoice = null;
        if ($createInvoice) {
            $invoice = PlatformInvoice::create([
                'organization_id' => $organization->id,
                'subscription_id' => $subscription->id,
                'invoice_number' => 'PLAT-TEST-'.uniqid(),
                'billing_period_start' => $subscription->current_period_start->toDateString(),
                'billing_period_end' => $subscription->current_period_end->toDateString(),
                'due_date' => now()->addDays(7)->toDateString(),
                'currency' => 'USD',
                'subtotal' => 99,
                'total_amount' => 99,
                'amount_paid' => 0,
                'balance_due' => 99,
                'status' => 'open',
                'payment_method' => 'manual',
            ]);
        }
        $admin = User::factory()->create([
            'organization_id' => $organization->id,
            'role' => 'daycare_admin',
            'status' => 'active',
        ]);

        return [$organization, $admin, $subscription, $invoice];
    }
}
