import type { CreditSnapshot, PollerOptions } from './types.js'

export async function pollOpenRouter(opts: PollerOptions): Promise<CreditSnapshot> {
  const res = await fetch('https://openrouter.ai/api/v1/credits', {
    headers: { Authorization: `Bearer ${opts.apiKey}` },
  })
  if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`)

  const data = await res.json() as { data?: { total_credits?: number; total_usage?: number } }

  const totalCredits = data.data?.total_credits ?? null
  const totalUsage = data.data?.total_usage ?? null

  return {
    provider: 'openrouter',
    name: 'OpenRouter',
    granted: totalCredits,
    remaining: totalCredits != null && totalUsage != null ? totalCredits - totalUsage : null,
    periodSpend: totalUsage,
    expiry: opts.creditExpiry ?? null,
  }
}
