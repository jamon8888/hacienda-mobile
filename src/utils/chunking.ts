/**
 * Drops chunks that are exact duplicates of an earlier chunk in the same list, after
 * normalizing whitespace and case. Only removes true repeats (e.g. a page header/footer
 * appearing in every chunk of a PDF) — never near-duplicates, which could carry distinct
 * meaning and would need a similarity model to tell apart safely.
 */
export function dedupeChunks(chunks: string[]): string[] {
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const chunk of chunks) {
        const key = chunk.trim().replace(/\s+/g, ' ').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(chunk);
    }
    return deduped;
}
