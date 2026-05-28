import type { CreditSnapshot, PollerOptions } from './types.js'

export async function pollVercel(opts: PollerOptions): Promise<CreditSnapshot> {
  const headers = { Authorization: `Bearer ${opts.apiKey}` }

  let periodSpend: number | null = null
  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const res = await fetch(
      `https://api.vercel.com/v1/billing/usage?from=${startOfMonth.toISOString()}&to=${now.toISOString()}`,
      { headers },
    )
    if (res.ok) {
      const data = await res.json() as { totalCost?: number; usage?: { cost?: number } }
      periodSpend = data.totalCost ?? data.usage?.cost ?? null
    }
  } catch {
    // usage endpoint varies by plan
  }

  let remaining: number | null = null
  let granted: number | null = null

  if (opts.creditGrant) {
    granted = opts.creditGrant
    remaining = periodSpend != null ? opts.creditGrant - periodSpend : opts.creditGrant
  }

  return {
    provider: 'vercel',
    name: 'Vercel',
    granted,
    remaining,
    periodSpend,
    expiry: opts.creditExpiry ?? null,
  }
}
