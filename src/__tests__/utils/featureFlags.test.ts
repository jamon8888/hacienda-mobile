import {
  isInferenceCloudEnabled,
  isVerticalEnabled,
  isNEREnabled,
  isLoRAEnabled,
  isNeedleEnabled,
  isDocumentGenerationEnabled,
  isPushToTalkEnabled,
  isAudioMemosEnabled,
  isOfficeReadingEnabled,
} from "@/utils/featureFlags";
import subscriptionStore from "@/store/SubscriptionStore";

jest.mock("@/store/SubscriptionStore", () => {
  const store = {
    tier: "free",
    status: "active",
    get isPaid() {
      return (
        this.tier === "paid" &&
        (this.status === "active" || this.status === "trial")
      );
    },
  };
  return {
    __esModule: true,
    default: store,
    subscriptionStore: store,
  };
});

describe("featureFlags", () => {
  beforeEach(() => {
    subscriptionStore.tier = "free";
    subscriptionStore.status = "active";
  });

  describe("isInferenceCloudEnabled", () => {
    it("should return false for free tier", () => {
      subscriptionStore.tier = "free";
      expect(isInferenceCloudEnabled()).toBe(false);
    });

    it("should return true for paid tier", () => {
      subscriptionStore.tier = "paid";
      subscriptionStore.status = "active";
      expect(isInferenceCloudEnabled()).toBe(true);
    });

    it("should return true for trial tier", () => {
      subscriptionStore.tier = "paid";
      subscriptionStore.status = "trial";
      expect(isInferenceCloudEnabled()).toBe(true);
    });
  });

  describe("placeholder features (return false)", () => {
    it("isVerticalEnabled returns false", () => {
      expect(isVerticalEnabled()).toBe(false);
    });

    it("isNEREnabled returns false", () => {
      expect(isNEREnabled()).toBe(false);
    });

    it("isLoRAEnabled returns false", () => {
      expect(isLoRAEnabled()).toBe(false);
    });

    it("isNeedleEnabled returns false", () => {
      expect(isNeedleEnabled()).toBe(false);
    });
  });

  describe("free features (return true)", () => {
    it("isDocumentGenerationEnabled returns true", () => {
      expect(isDocumentGenerationEnabled()).toBe(true);
    });

    it("isPushToTalkEnabled returns true", () => {
      expect(isPushToTalkEnabled()).toBe(true);
    });

    it("isAudioMemosEnabled returns true", () => {
      expect(isAudioMemosEnabled()).toBe(true);
    });

    it("isOfficeReadingEnabled returns true", () => {
      expect(isOfficeReadingEnabled()).toBe(true);
    });
  });
});
