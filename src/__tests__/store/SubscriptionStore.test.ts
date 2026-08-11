import Subscription from "@/database/models/Subscription";
import subscriptionStore, {
  SubscriptionStore,
} from "@/store/SubscriptionStore";

jest.mock("@/database/models/Subscription", () => ({
  __esModule: true,
  default: {
    findForUser: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

describe("SubscriptionStore", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store state
    subscriptionStore.tier = "free";
    subscriptionStore.status = "active";
    subscriptionStore.subscriptionId = null;
    subscriptionStore.trialEndsAt = null;
    subscriptionStore.loading = false;
  });

  describe("initial state", () => {
    it("should have default free tier", () => {
      expect(subscriptionStore.tier).toBe("free");
    });

    it("should have default active status", () => {
      expect(subscriptionStore.status).toBe("active");
    });

    it("should have null subscriptionId", () => {
      expect(subscriptionStore.subscriptionId).toBeNull();
    });

    it("should have null trialEndsAt", () => {
      expect(subscriptionStore.trialEndsAt).toBeNull();
    });

    it("should have loading false", () => {
      expect(subscriptionStore.loading).toBe(false);
    });
  });

  describe("isPaid computed", () => {
    it("should return false for free tier", () => {
      subscriptionStore.tier = "free";
      subscriptionStore.status = "active";
      expect(subscriptionStore.isPaid).toBe(false);
    });

    it("should return true for paid tier with active status", () => {
      subscriptionStore.tier = "paid";
      subscriptionStore.status = "active";
      expect(subscriptionStore.isPaid).toBe(true);
    });

    it("should return true for paid tier with trial status", () => {
      subscriptionStore.tier = "paid";
      subscriptionStore.status = "trial";
      expect(subscriptionStore.isPaid).toBe(true);
    });

    it("should return false for paid tier with cancelled status", () => {
      subscriptionStore.tier = "paid";
      subscriptionStore.status = "cancelled";
      expect(subscriptionStore.isPaid).toBe(false);
    });

    it("should return false for paid tier with expired status", () => {
      subscriptionStore.tier = "paid";
      subscriptionStore.status = "expired";
      expect(subscriptionStore.isPaid).toBe(false);
    });
  });

  describe("isTrialActive computed", () => {
    it("should return false when status is not trial", () => {
      subscriptionStore.tier = "paid";
      subscriptionStore.status = "active";
      subscriptionStore.trialEndsAt = Date.now() + 100000;
      expect(subscriptionStore.isTrialActive).toBe(false);
    });

    it("should return true when status is trial and trialEndsAt is in future", () => {
      subscriptionStore.tier = "paid";
      subscriptionStore.status = "trial";
      subscriptionStore.trialEndsAt = Date.now() + 100000;
      expect(subscriptionStore.isTrialActive).toBe(true);
    });

    it("should return false when status is trial but trialEndsAt is in past", () => {
      subscriptionStore.tier = "paid";
      subscriptionStore.status = "trial";
      subscriptionStore.trialEndsAt = Date.now() - 100000;
      expect(subscriptionStore.isTrialActive).toBe(false);
    });

    it("should return false when status is trial but trialEndsAt is null", () => {
      subscriptionStore.tier = "paid";
      subscriptionStore.status = "trial";
      subscriptionStore.trialEndsAt = null;
      expect(subscriptionStore.isTrialActive).toBe(false);
    });
  });

  describe("loadSubscription", () => {
    it("should load existing subscription from database", async () => {
      const mockSub = {
        id: "sub-123",
        userId: "user-1",
        tier: "paid",
        status: "active",
        trialEndsAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      (Subscription.findForUser as jest.Mock).mockResolvedValue(mockSub);

      await subscriptionStore.loadSubscription("user-1");

      expect(Subscription.findForUser).toHaveBeenCalledWith("user-1");
      expect(subscriptionStore.tier).toBe("paid");
      expect(subscriptionStore.status).toBe("active");
      expect(subscriptionStore.subscriptionId).toBe("sub-123");
      expect(subscriptionStore.trialEndsAt).toBeNull();
      expect(subscriptionStore.loading).toBe(false);
    });

    it("should create free subscription for new user", async () => {
      const mockNewSub = {
        id: "sub-new",
        userId: "user-new",
        tier: "free",
        status: "active",
        trialEndsAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      (Subscription.findForUser as jest.Mock).mockResolvedValue(null);
      (Subscription.create as jest.Mock).mockResolvedValue(mockNewSub);

      await subscriptionStore.loadSubscription("user-new");

      expect(Subscription.create).toHaveBeenCalledWith({
        userId: "user-new",
        tier: "free",
        status: "active",
      });
      expect(subscriptionStore.tier).toBe("free");
      expect(subscriptionStore.status).toBe("active");
      expect(subscriptionStore.subscriptionId).toBe("sub-new");
      expect(subscriptionStore.loading).toBe(false);
    });

    it("should set loading to true during load", async () => {
      (Subscription.findForUser as jest.Mock).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(null), 100)),
      );
      (Subscription.create as jest.Mock).mockResolvedValue({
        id: "sub-1",
        tier: "free",
        status: "active",
      });

      const loadPromise = subscriptionStore.loadSubscription("user-1");
      expect(subscriptionStore.loading).toBe(true);

      await loadPromise;
      expect(subscriptionStore.loading).toBe(false);
    });

    it("should handle database errors gracefully", async () => {
      const consoleSpy = jest
        .spyOn(console, "error")
        .mockImplementation();
      (Subscription.findForUser as jest.Mock).mockRejectedValue(
        new Error("DB error"),
      );

      await subscriptionStore.loadSubscription("user-1");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to load subscription:",
        expect.any(Error),
      );
      expect(subscriptionStore.loading).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe("activateTrial", () => {
    it("should update subscription to trial status", async () => {
      subscriptionStore.subscriptionId = "sub-123";
      (Subscription.update as jest.Mock).mockResolvedValue({});

      const before = Date.now();
      await subscriptionStore.activateTrial();
      const after = Date.now();

      expect(Subscription.update).toHaveBeenCalledWith("sub-123", {
        tier: "paid",
        status: "trial",
        trialEndsAt: expect.any(Number),
      });

      expect(subscriptionStore.tier).toBe("paid");
      expect(subscriptionStore.status).toBe("trial");
      expect(subscriptionStore.trialEndsAt).toBeGreaterThanOrEqual(
        before + 3 * 24 * 60 * 60 * 1000,
      );
      expect(subscriptionStore.trialEndsAt).toBeLessThanOrEqual(
        after + 3 * 24 * 60 * 60 * 1000,
      );
    });
  });

  describe("activatePaid", () => {
    it("should update subscription to paid active status", async () => {
      subscriptionStore.subscriptionId = "sub-123";
      subscriptionStore.trialEndsAt = Date.now() + 100000;
      (Subscription.update as jest.Mock).mockResolvedValue({});

      await subscriptionStore.activatePaid();

      expect(Subscription.update).toHaveBeenCalledWith("sub-123", {
        tier: "paid",
        status: "active",
        trialEndsAt: null,
      });
      expect(subscriptionStore.tier).toBe("paid");
      expect(subscriptionStore.status).toBe("active");
      expect(subscriptionStore.trialEndsAt).toBeNull();
    });
  });

  describe("cancelSubscription", () => {
    it("should cancel subscription and revert to free", async () => {
      subscriptionStore.subscriptionId = "sub-123";
      subscriptionStore.tier = "paid";
      subscriptionStore.status = "active";
      (Subscription.update as jest.Mock).mockResolvedValue({});

      await subscriptionStore.cancelSubscription();

      expect(Subscription.update).toHaveBeenCalledWith("sub-123", {
        tier: "free",
        status: "cancelled",
        trialEndsAt: null,
      });
      expect(subscriptionStore.tier).toBe("free");
      expect(subscriptionStore.status).toBe("cancelled");
      expect(subscriptionStore.trialEndsAt).toBeNull();
    });
  });
});
