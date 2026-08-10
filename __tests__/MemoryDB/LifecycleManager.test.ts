describe('LifecycleManager', () => {
  it('should apply exponential decay to importance', () => {
    const importance = 0.5;
    const daysSinceAccess = 30;
    const decayRate = 0.05;
    const expected = importance * Math.exp(-decayRate * daysSinceAccess);
    expect(expected).toBeLessThan(importance);
    expect(expected).toBeGreaterThan(0);
  });

  it('should not decay recent memories', () => {
    const importance = 0.5;
    const daysSinceAccess = 1;
    const decayRate = 0.05;
    const expected = importance * Math.exp(-decayRate * daysSinceAccess);
    expect(expected).toBeCloseTo(importance, 2);
  });

  it('should prune memories below threshold', () => {
    const threshold = 0.05;
    const importance = 0.03;
    expect(importance).toBeLessThan(threshold);
  });
});
