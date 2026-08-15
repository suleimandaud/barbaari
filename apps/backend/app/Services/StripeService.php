<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\PlatformInvoice;
use App\Models\Subscription;
use Stripe\ApiRequestor;
use Stripe\Checkout\Session as CheckoutSession;
use Stripe\HttpClient\CurlClient;
use Stripe\StripeClient;

class StripeService
{
    private ?StripeClient $client = null;

    public function isConfigured(): bool
    {
        return (bool) config('services.stripe.secret');
    }

    public function client(): StripeClient
    {
        if (! $this->client) {
            // The SDK's own defaults (80s total / 30s connect) are far too long for a
            // synchronous, user-facing request — every other external dependency in this
            // app (USPS, geocoding, timezone lookups) already has an explicit short
            // timeout; Stripe was the one gap.
            $curlClient = new CurlClient();
            $curlClient->setTimeout(15);
            $curlClient->setConnectTimeout(5);
            ApiRequestor::setHttpClient($curlClient);

            $this->client = new StripeClient(config('services.stripe.secret'));
        }

        return $this->client;
    }

    public function getOrCreateCustomer(Organization $organization): string
    {
        if ($organization->stripe_customer_id) {
            return $organization->stripe_customer_id;
        }

        $subscription = Subscription::where('organization_id', $organization->id)->latest()->first();
        if ($subscription?->stripe_customer_id) {
            $organization->update(['stripe_customer_id' => $subscription->stripe_customer_id]);
            return $subscription->stripe_customer_id;
        }

        $customer = $this->client()->customers->create([
            'name' => $organization->name,
            'email' => $organization->email,
            'metadata' => [
                'organization_id' => (string) $organization->id,
                'organization_name' => $organization->name,
            ],
        ]);

        $organization->update(['stripe_customer_id' => $customer->id]);
        if ($subscription) {
            $subscription->update(['stripe_customer_id' => $customer->id]);
        }

        return $customer->id;
    }

    public function createSubscriptionCheckout(
        Organization $organization,
        Subscription $subscription
    ): CheckoutSession {
        $customerId = $this->getOrCreateCustomer($organization);
        $priceId = config('services.stripe.price_id');

        abort_unless($priceId, 422, 'STRIPE_PRICE_ID is not configured. Set it in .env.');

        $frontendUrl = rtrim(config('app.frontend_url', 'http://localhost:5173'), '/');
        abort_if(empty($frontendUrl), 500, 'FRONTEND_URL is not configured. Add it to .env and run: php artisan config:cache');
        $successUrl = $frontendUrl.'/subscription/success?session_id={CHECKOUT_SESSION_ID}';
        $cancelUrl  = $frontendUrl.'/subscription-payment?canceled=1';

        return $this->client()->checkout->sessions->create([
            'customer' => $customerId,
            'payment_method_types' => ['card'],
            'mode' => 'subscription',
            'line_items' => [
                ['price' => $priceId, 'quantity' => 1],
            ],
            'success_url' => $successUrl,
            'cancel_url' => $cancelUrl,
            'subscription_data' => [
                'metadata' => [
                    'organization_id' => (string) $organization->id,
                    'subscription_id' => (string) $subscription->id,
                ],
            ],
            'metadata' => [
                'organization_id' => (string) $organization->id,
                'subscription_id' => (string) $subscription->id,
                'mode' => 'platform_subscription',
            ],
        ]);
    }

    public function createOneTimeCheckout(
        Organization $organization,
        Subscription $subscription,
        PlatformInvoice $invoice
    ): CheckoutSession {
        $customerId = $this->getOrCreateCustomer($organization);
        $plan = $subscription->pricingPlan;
        $amount = (int) round((float) $invoice->balance_due * 100);
        $currency = strtolower($invoice->currency ?? 'usd');

        $frontendUrl = rtrim(config('app.frontend_url', 'http://localhost:5173'), '/');
        abort_if(empty($frontendUrl), 500, 'FRONTEND_URL is not configured. Add it to .env and run: php artisan config:cache');
        $successUrl = $frontendUrl.'/subscription/success?session_id={CHECKOUT_SESSION_ID}';
        $cancelUrl  = $frontendUrl.'/subscription-payment?canceled=1';

        return $this->client()->checkout->sessions->create([
            'customer' => $customerId,
            'payment_method_types' => ['card'],
            'mode' => 'payment',
            'line_items' => [
                [
                    'price_data' => [
                        'currency' => $currency,
                        'unit_amount' => $amount,
                        'product_data' => [
                            'name' => ($plan?->name ?? 'Barbaari').' Subscription',
                            'description' => 'Invoice '.$invoice->invoice_number,
                        ],
                    ],
                    'quantity' => 1,
                ],
            ],
            'success_url' => $successUrl,
            'cancel_url' => $cancelUrl,
            'metadata' => [
                'organization_id' => (string) $organization->id,
                'subscription_id' => (string) $subscription->id,
                'invoice_id' => (string) $invoice->id,
                'mode' => 'platform_billing',
            ],
            'payment_intent_data' => [
                'metadata' => [
                    'organization_id' => (string) $organization->id,
                    'invoice_id' => (string) $invoice->id,
                ],
            ],
        ]);
    }

    public function cancelSubscription(string $stripeSubscriptionId, bool $atPeriodEnd = true): \Stripe\Subscription
    {
        if ($atPeriodEnd) {
            return $this->client()->subscriptions->update($stripeSubscriptionId, [
                'cancel_at_period_end' => true,
            ]);
        }

        return $this->client()->subscriptions->cancel($stripeSubscriptionId);
    }

    public function constructWebhookEvent(string $payload, string $signature): \Stripe\Event
    {
        $secret = config('services.stripe.webhook_secret');
        if (! $secret) {
            throw new \RuntimeException('STRIPE_WEBHOOK_SECRET is not configured.');
        }

        return \Stripe\Webhook::constructEvent($payload, $signature, $secret);
    }
}
