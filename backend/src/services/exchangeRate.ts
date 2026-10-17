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

const TRM_URL = 'https://www.datos.gov.co/resource/32sa-8pi3.json';

export interface TrmRate {
  rate: number;
  /** First day the returned TRM was in force (YYYY-MM-DD). */
  valid_from: string;
  /** False when the requested date had no published TRM yet and the latest earlier one was used. */
  exact: boolean;
}

interface TrmRow {
  valor: string;
  vigenciadesde: string;
  vigenciahasta: string;
}

const trmCache = new Map<string, TrmRate>();

async function queryTrm(params: Record<string, string>): Promise<TrmRow | undefined> {
  const url = `${TRM_URL}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`TRM provider responded ${response.status}`);
  const rows = (await response.json()) as TrmRow[];
  return rows[0];
}

/**
 * Official TRM (Superfinanciera open data) in force on `date` (YYYY-MM-DD).
 * Weekends/holidays are covered by the published validity ranges. If the date has no
 * published TRM (e.g. a future date), the most recent earlier one is returned with exact=false.
 */
export async function getTrmForDate(date: string): Promise<TrmRate> {
  const cached = trmCache.get(date);
  if (cached) return cached;

  const day = `${date}T00:00:00.000`;
  let row = await queryTrm({
    $where: `vigenciadesde<='${day}' AND vigenciahasta>='${day}'`,
    $order: 'vigenciadesde DESC',
    $limit: '1'
  });
  let exact = true;
  if (!row) {
    exact = false;
    row = await queryTrm({
      $where: `vigenciadesde<='${day}'`,
      $order: 'vigenciadesde DESC',
      $limit: '1'
    });
  }
  const rate = row ? Number(row.valor) : NaN;
  if (!row || !(rate > 0)) throw new Error('No TRM available for the requested date');

  const value = { rate, valid_from: row.vigenciadesde.slice(0, 10), exact };
  if (exact) trmCache.set(date, value); // published TRMs never change
  return value;
}
