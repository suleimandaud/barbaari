import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { colors, daycarePlatformBillingApi, getApiError } from "@barbaari/shared";
import { Button } from "./Ui";

/**
 * Mirrors apps/daycare-web/src/pages/SubscriptionPaymentPage.tsx — same endpoints, same
 * gate. The billing endpoints below are the exact allowlisted paths that stay reachable
 * behind an inactive-subscription 402 (EnsureActiveSubscription::isPaymentGateAllowedPath),
 * so this screen works using whatever session token is already active — no new backend
 * surface, nothing tablet-specific added.
 *
 * Reachability depends on the currently-signed-in user's role (daycare_admin/manager
 * only, same as web) — the person who unlocked the tablet may not be that user (e.g. a
 * staff PIN unlock). That's a real permission boundary, not a bug, so this component
 * degrades to a plain "ask an admin" message rather than a broken/blank screen when the
 * billing calls come back 401/403.
 */
export function SubscriptionRequiredScreen({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [subscriptionData, setSubscriptionData] = useState<any>(null);
  const [paying, setPaying] = useState(false);
  const [actionError, setActionError] = useState("");

  async function load() {
    setStatus("loading");
    setActionError("");
    try {
      const response = await daycarePlatformBillingApi.subscription();
      setSubscriptionData(response);
      setStatus("ready");
    } catch (err) {
      const apiError = getApiError(err);
      setStatus(apiError.status === 401 || apiError.status === 403 ? "forbidden" : "error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function payWithStripe() {
    setActionError("");
    setPaying(true);
    try {
      const response = await daycarePlatformBillingApi.createStripeCheckoutSession({});
      if (response.checkout_url) {
        await Linking.openURL(response.checkout_url);
        return;
      }
      setActionError(response.message ?? "Checkout could not be started. Please contact support.");
    } catch (err) {
      setActionError(getApiError(err).message || "Something went wrong. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  const subscription = subscriptionData?.subscription;
  const plan = subscription?.pricing_plan;
  const invoice = subscriptionData?.unpaid_invoice;
  const orgName = subscription?.organization?.name ?? "Your organization";
  const isSuspended = subscription?.status === "suspended";

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Subscription required</Text>
      <Text style={styles.detail}>{orgName}</Text>

      {status === "loading" ? <Text style={styles.detail}>Loading subscription status...</Text> : null}

      {status === "forbidden" ? (
        <>
          <Text style={styles.warning}>
            This organization's subscription is not active. Attendance, children, classrooms, and staff/parent tablet
            modes are unavailable until it is resolved.
          </Text>
          <Text style={styles.detail}>
            Payment can only be completed by an organization admin or manager, signed in to the Barbaari app or web
            dashboard.
          </Text>
        </>
      ) : null}

      {status === "error" ? (
        <>
          <Text style={styles.warning}>Could not load subscription details. Check your connection and try again.</Text>
          <Button variant="outline" onPress={load}>Retry</Button>
        </>
      ) : null}

      {status === "ready" && isSuspended ? (
        <>
          <Text style={styles.warning}>Account suspended. Please contact Barbaari support to resolve this.</Text>
        </>
      ) : null}

      {status === "ready" && !isSuspended ? (
        <>
          {plan ? <Text style={styles.detail}>Plan: {plan.name}</Text> : null}
          {invoice ? (
            <>
              <Text style={styles.detail}>Invoice: {invoice.invoice_number}</Text>
              <Text style={styles.amount}>${Number(invoice.balance_due ?? 0).toFixed(2)} due</Text>
            </>
          ) : (
            <Text style={styles.detail}>Your subscription is being configured. If this persists, contact support.</Text>
          )}
          {actionError ? <Text style={styles.warning}>{actionError}</Text> : null}
          {invoice ? (
            <Button disabled={paying} onPress={payWithStripe}>{paying ? "Opening Stripe..." : "Pay with Stripe"}</Button>
          ) : (
            <Button variant="outline" onPress={load}>Refresh</Button>
          )}
        </>
      ) : null}

      <Button variant="outline" onPress={onBack}>Back to tablet unlock</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 16, padding: 22, borderRadius: 30, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  title: { color: "#0E2A33", fontSize: 30, fontWeight: "900" },
  detail: { color: colors.muted, fontSize: 16, lineHeight: 22 },
  amount: { color: "#0E2A33", fontSize: 26, fontWeight: "900" },
  warning: { padding: 14, borderRadius: 18, backgroundColor: "#FFF4CA", color: "#9A6A09", fontWeight: "800", lineHeight: 21 }
});
