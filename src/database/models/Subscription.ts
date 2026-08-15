import { field, text } from "@nozbe/watermelondb/decorators";
import { database } from "@/database";
import { Q, Model } from "@nozbe/watermelondb";

export type SubscriptionTier = "free" | "paid";
export type SubscriptionStatus = "active" | "cancelled" | "trial" | "expired";

export type SubscriptionType = {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export default class Subscription extends Model {
  static table = "subscriptions";

  @text("user_id") userId!: string;
  @text("tier") tier!: SubscriptionTier;
  @text("status") status!: SubscriptionStatus;
  @field("trial_ends_at") trialEndsAt!: number | null;
  @field("created_at") createdAt!: number;
  @field("updated_at") updatedAt!: number;

  static toSubscriptionObject(data: Subscription): SubscriptionType {
    const { id, userId, tier, status, trialEndsAt, createdAt, updatedAt } =
      data;
    return { id, userId, tier, status, trialEndsAt, createdAt, updatedAt };
  }

  static async findForUser(userId: string): Promise<SubscriptionType | null> {
    const results = await database
      .get(Subscription.table)
      .query(Q.where("user_id", userId))
      .fetch();
    if (results.length === 0) {
      return null;
    }
    return this.toSubscriptionObject(results[0] as Subscription);
  }

  static async create(
    data: Partial<SubscriptionType>,
  ): Promise<SubscriptionType> {
    const { userId, tier, status, trialEndsAt } = data;

    let newSubscription: Subscription | null = null;
    await database.write(async () => {
      newSubscription = (await database
        .get(Subscription.table)
        .create((record: Model) => {
          const subscription = record as Subscription;
          subscription.userId = userId ?? "";
          subscription.tier = tier ?? "free";
          subscription.status = status ?? "active";
          subscription.trialEndsAt = trialEndsAt ?? null;
          subscription.createdAt = Date.now();
          subscription.updatedAt = Date.now();
        })) as Subscription;
    });

    if (!newSubscription) {
      throw new Error("Failed to create Subscription");
    }
    return this.toSubscriptionObject(newSubscription);
  }

  static async update(
    id: string,
    updates: Partial<Pick<SubscriptionType, "tier" | "status" | "trialEndsAt">>,
  ): Promise<SubscriptionType> {
    let updatedSubscription: Subscription | null = null;
    await database.write(async () => {
      let record: Subscription;
      try {
        record = (await database
          .get(Subscription.table)
          .find(id)) as Subscription;
      } catch {
        throw new Error(`Subscription record not found: ${id}`);
      }
      updatedSubscription = (await record.update(
        (subscription: Subscription) => {
          if (updates.tier !== undefined) {
            subscription.tier = updates.tier;
          }
          if (updates.status !== undefined) {
            subscription.status = updates.status;
          }
          if (updates.trialEndsAt !== undefined) {
            subscription.trialEndsAt = updates.trialEndsAt;
          }
          subscription.updatedAt = Date.now();
        },
      )) as Subscription;
    });

    if (!updatedSubscription) {
      throw new Error("Failed to update Subscription");
    }
    return this.toSubscriptionObject(updatedSubscription);
  }
}
