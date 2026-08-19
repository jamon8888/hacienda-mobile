// Ensure a JSON column decoded as `vector_box_ids` is always an array of numbers.
export default function sanitizeVectorBoxIds(json: unknown): number[] {
  return Array.isArray(json) ? json.map(Number) : [];
}
