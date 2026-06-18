<?php

namespace App\Http\Middleware;

use App\Services\SubscriptionAccessService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveSubscription
{
    public function __construct(private SubscriptionAccessService $subscriptions)
    {
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($this->subscriptions->isBypassUser($user)) {
            return $next($request);
        }

        if ($user->status === 'pending_approval') {
            return response()->json(['message' => 'Your application is still pending approval.'], 403);
        }

        if ($user->status === 'rejected') {
            return response()->json(['message' => 'Your application was not approved. Please contact support.'], 403);
        }

        if ($user->status !== 'active') {
            return response()->json(['message' => 'User is not active.'], 403);
        }

        if (! $user->organization_id) {
            return response()->json(['message' => 'This account is not linked to an approved provider organization.'], 403);
        }

        if ($this->isPaymentGateAllowedPath($request)) {
            return $next($request);
        }

        $organization = $user->organization;
        if (! $organization || $organization->status !== 'active') {
            return response()->json([
                'message' => 'Your organization is approved but requires subscription setup before dashboard access.',
                'requires_payment' => true,
                'organization_status' => $organization?->status,
                'redirect_to' => '/subscription-payment',
            ], 402);
        }

        $gate = $this->subscriptions->getPaymentGateReason($user->organization_id);

        if ($gate['requires_payment']) {
            return response()->json([
                'message' => 'Your organization subscription requires payment.',
                'requires_payment' => true,
                'subscription_status' => $gate['subscription_status'],
                'redirect_to' => '/subscription-payment',
            ], 402);
        }

        return $next($request);
    }

    private function isPaymentGateAllowedPath(Request $request): bool
    {
        $path = trim($request->path(), '/');

        foreach ([
            'api/daycare/subscription',
            'api/daycare/billing/invoices',
            'api/daycare/billing/payments',
            'api/daycare/billing/request-plan-change',
            'api/daycare/billing/stripe/create-checkout-session',
            'api/daycare/billing/stripe/confirm-session',
            'api/daycare/billing/test-payment-success',
        ] as $allowed) {
            if ($path === $allowed || str_starts_with($path, $allowed.'/')) {
                return true;
            }
        }

        return false;
    }
}
