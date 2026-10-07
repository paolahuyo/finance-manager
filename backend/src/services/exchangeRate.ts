const RATES_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_MS = 60 * 60 * 1000;

export interface UsdCopRate {
  rate: number;
  updated_at: string;
}

let cache: { value: UsdCopRate; fetchedAt: number } | null = null;

/** USD -> COP rate, cached for one hour. Throws if the provider is unreachable. */
export async function getUsdCopRate(): Promise<UsdCopRate> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.value;

  const response = await fetch(RATES_URL, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Exchange rate provider responded ${response.status}`);

  const data = (await response.json()) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_utc?: string;
  };
  const rate = data.rates?.COP;
  if (data.result !== 'success' || typeof rate !== 'number' || !(rate > 0)) {
    throw new Error('Exchange rate provider returned an unexpected payload');
  }

  const value = { rate, updated_at: data.time_last_update_utc ?? new Date().toISOString() };
  cache = { value, fetchedAt: Date.now() };
  return value;
}
