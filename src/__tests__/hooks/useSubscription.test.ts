import { renderHook } from "@testing-library/react-hooks";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import subscriptionStore from "@/store/SubscriptionStore";
import Subscription from "@/database/models/Subscription";

jest.mock("@/hooks/useAuth", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/database/models/Subscription", () => ({
  __esModule: true,
  default: {
    findForUser: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

describe("useSubscription", () => {
  let loadSubscriptionSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({ user: { id: "user-1" } });
    subscriptionStore.tier = "free";
    subscriptionStore.status = "active";
    subscriptionStore.subscriptionId = null;
    subscriptionStore.trialEndsAt = null;
    subscriptionStore.loading = false;

    loadSubscriptionSpy = jest
      .spyOn(subscriptionStore, "loadSubscription")
      .mockImplementation(async () => {});
  });

  afterEach(() => {
    loadSubscriptionSpy.mockRestore();
  });

  it("should return subscription state from store", () => {
    const { result } = renderHook(() => useSubscription());

    expect(result.current.tier).toBe("free");
    expect(result.current.status).toBe("active");
    expect(result.current.isPaid).toBe(false);
    expect(result.current.isTrialActive).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it("should return action functions", () => {
    const { result } = renderHook(() => useSubscription());

    expect(typeof result.current.activateTrial).toBe("function");
    expect(typeof result.current.activatePaid).toBe("function");
    expect(typeof result.current.cancelSubscription).toBe("function");
  });

  it("should call loadSubscription when user.id is available", () => {
    renderHook(() => useSubscription());

    expect(loadSubscriptionSpy).toHaveBeenCalledWith("user-1");
  });

  it("should not call loadSubscription when user is undefined", () => {
    (useAuth as jest.Mock).mockReturnValue({ user: undefined });

    renderHook(() => useSubscription());

    expect(loadSubscriptionSpy).not.toHaveBeenCalled();
  });

  it("should not call loadSubscription when user.id is undefined", () => {
    (useAuth as jest.Mock).mockReturnValue({ user: { id: undefined } });

    renderHook(() => useSubscription());

    expect(loadSubscriptionSpy).not.toHaveBeenCalled();
  });

  it("should expose activateTrial from store", () => {
    const { result } = renderHook(() => useSubscription());

    expect(result.current.activateTrial).toBeDefined();
    expect(typeof result.current.activateTrial).toBe("function");
  });

  it("should expose activatePaid from store", () => {
    const { result } = renderHook(() => useSubscription());

    expect(result.current.activatePaid).toBeDefined();
    expect(typeof result.current.activatePaid).toBe("function");
  });

  it("should expose cancelSubscription from store", () => {
    const { result } = renderHook(() => useSubscription());

    expect(result.current.cancelSubscription).toBeDefined();
    expect(typeof result.current.cancelSubscription).toBe("function");
  });
});
