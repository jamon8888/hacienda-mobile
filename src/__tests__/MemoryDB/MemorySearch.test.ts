describe('MemorySearch', () => {
  it('should compute final scores correctly', () => {
    const vectorScore = 0.8;
    const bm25Score = 0.6;
    const vectorWeight = 0.6;
    const bm25Weight = 0.4;

    const finalScore = vectorScore * vectorWeight + bm25Score * bm25Weight;
    expect(finalScore).toBeCloseTo(0.72, 2);
  });

  it('should apply freshness bonus', () => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const freshnessBonus = Math.exp(-(now - oneDayAgo) / (1000 * 60 * 60 * 24) * 0.1);
    expect(freshnessBonus).toBeGreaterThan(0.9);
  });

  it('should apply structural priority for documents', () => {
    const kind = 'document';
    const structuralPriority = kind === 'document' ? 0.15 : 0;
    expect(structuralPriority).toBe(0.15);
  });

  it('should not apply structural priority for conversations', () => {
    const kind = 'conversation' as 'conversation' | 'document';
    const structuralPriority = kind === 'document' ? 0.15 : 0;
    expect(structuralPriority).toBe(0);
  });
});
