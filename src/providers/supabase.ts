import type { CreditSnapshot, PollerOptions } from './types.js'

export async function pollSupabase(opts: PollerOptions): Promise<CreditSnapshot> {
  const headers = { Authorization: `Bearer ${opts.apiKey}` }

  const orgsRes = await fetch('https://api.supabase.com/v1/organizations', { headers })
  if (!orgsRes.ok) {
    const body = await orgsRes.text().catch(() => '')
    throw new Error(`Supabase API error: ${orgsRes.status} ${body}`.trim())
  }

  const orgs = await orgsRes.json() as { id: string; slug: string }[]
  if (!orgs.length) throw new Error('No Supabase organizations found for this token')

  const orgSlug = orgs[0].slug

  let periodSpend: number | null = null
  try {
    const usageRes = await fetch(
      `https://api.supabase.com/v1/organizations/${orgSlug}/billing/usage`,
      { headers },
    )
    if (usageRes.ok) {
      const usage = await usageRes.json() as { total_usage?: number; usages?: { cost?: number }[] }
      if (usage.total_usage != null) {
        periodSpend = usage.total_usage / 100
      } else if (usage.usages) {
        let total = 0
        for (const u of usage.usages) total += u.cost ?? 0
        periodSpend = total / 100
      }
    }
  } catch {
    // usage endpoint may not be accessible
  }

  let remaining: number | null = null
  let granted: number | null = null

  if (opts.creditGrant) {
    granted = opts.creditGrant
    remaining = periodSpend != null ? opts.creditGrant - periodSpend : opts.creditGrant
  }

  return {
    provider: 'supabase',
    name: 'Supabase',
    granted,
    remaining,
    periodSpend,
    expiry: opts.creditExpiry ?? null,
  }
}
