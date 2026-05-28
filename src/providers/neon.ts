import type { CreditSnapshot, PollerOptions } from './types.js'

export async function pollNeon(opts: PollerOptions): Promise<CreditSnapshot> {
  const headers = { Authorization: `Bearer ${opts.apiKey}` }

  let periodSpend: number | null = null
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const res = await fetch(
      `https://console.neon.tech/api/v2/consumption/projects?from=${startOfMonth.toISOString()}&to=${now.toISOString()}`,
      { headers },
    )
    if (res.ok) {
      const data = await res.json() as { periods?: { data_storage_bytes_hour?: number; compute_time_seconds?: number }[] }
      // Neon billing is complex; approximate from compute time
      if (data.periods?.length) {
        let totalCompute = 0
        for (const p of data.periods) totalCompute += p.compute_time_seconds ?? 0
        // Rough: $0.102/compute-hour
        periodSpend = (totalCompute / 3600) * 0.102
      }
    }
  } catch {
    // consumption endpoint may not be accessible
  }

  let remaining: number | null = null
  let granted: number | null = null

  if (opts.creditGrant) {
    granted = opts.creditGrant
    remaining = periodSpend != null ? opts.creditGrant - periodSpend : opts.creditGrant
  }

  return {
    provider: 'neon',
    name: 'Neon',
    granted,
    remaining,
    periodSpend,
    expiry: opts.creditExpiry ?? null,
  }
}
