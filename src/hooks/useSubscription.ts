import { useEffect } from "react";
import { subscriptionStore } from "@/store/SubscriptionStore";
import { useAuth } from "@/hooks/useAuth";

export function useSubscription() {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      subscriptionStore.loadSubscription(user.id);
    }
  }, [user?.id]);

  return {
    tier: subscriptionStore.tier,
    status: subscriptionStore.status,
    isPaid: subscriptionStore.isPaid,
    isTrialActive: subscriptionStore.isTrialActive,
    loading: subscriptionStore.loading,
    activateTrial: subscriptionStore.activateTrial.bind(subscriptionStore),
    activatePaid: subscriptionStore.activatePaid.bind(subscriptionStore),
    cancelSubscription:
      subscriptionStore.cancelSubscription.bind(subscriptionStore),
  };
}
