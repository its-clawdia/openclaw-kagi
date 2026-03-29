export async function apiSearch(
  _apiKey: string,
  _query: string,
  _count: number
): Promise<never> {
  throw new Error(
    "Kagi API mode is not yet implemented. Use mode: 'session' (the default) " +
      "to search via Session Links. API mode will be available in a future version " +
      "when the Kagi Search API exits invite-only beta."
  );
}
