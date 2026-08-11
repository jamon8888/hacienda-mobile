import { makeAutoObservable, runInAction } from "mobx";
import Subscription, {
  SubscriptionTier,
  SubscriptionStatus,
} from "@/database/models/Subscription";

class SubscriptionStore {
  tier: SubscriptionTier = "free";
  status: SubscriptionStatus = "active";
  subscriptionId: string | null = null;
  trialEndsAt: number | null = null;
  loading = false;

  constructor() {
    makeAutoObservable(this);
  }

  get isPaid(): boolean {
    return (
      this.tier === "paid" &&
      (this.status === "active" || this.status === "trial")
    );
  }

  get isTrialActive(): boolean {
    return (
      this.status === "trial" &&
      this.trialEndsAt !== null &&
      Date.now() < this.trialEndsAt
    );
  }

  async loadSubscription(userId: string) {
    this.loading = true;
    try {
      const sub = await Subscription.findForUser(userId);
      if (sub) {
        runInAction(() => {
          this.tier = sub.tier;
          this.status = sub.status;
          this.subscriptionId = sub.id;
          this.trialEndsAt = sub.trialEndsAt;
        });
      } else {
        const newSub = await Subscription.create({
          userId,
          tier: "free",
          status: "active",
        });
        runInAction(() => {
          this.tier = "free";
          this.status = "active";
          this.subscriptionId = newSub.id;
        });
      }
    } catch (error) {
      console.error("Failed to load subscription:", error);
    } finally {
      this.loading = false;
    }
  }

  async activateTrial() {
    const trialEndsAt = Date.now() + 3 * 24 * 60 * 60 * 1000; // 3 days
    await Subscription.update(this.subscriptionId!, {
      tier: "paid",
      status: "trial",
      trialEndsAt,
    });
    runInAction(() => {
      this.tier = "paid";
      this.status = "trial";
      this.trialEndsAt = trialEndsAt;
    });
  }

  async activatePaid() {
    await Subscription.update(this.subscriptionId!, {
      tier: "paid",
      status: "active",
      trialEndsAt: null,
    });
    runInAction(() => {
      this.tier = "paid";
      this.status = "active";
      this.trialEndsAt = null;
    });
  }

  async cancelSubscription() {
    await Subscription.update(this.subscriptionId!, {
      tier: "free",
      status: "cancelled",
      trialEndsAt: null,
    });
    runInAction(() => {
      this.tier = "free";
      this.status = "cancelled";
      this.trialEndsAt = null;
    });
  }
}

export const subscriptionStore = new SubscriptionStore();
export default subscriptionStore;
