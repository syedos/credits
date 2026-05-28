import type { CreditSnapshot, PollerOptions } from './types.js'

export async function pollXAI(opts: PollerOptions): Promise<CreditSnapshot> {
  const headers = { Authorization: `Bearer ${opts.apiKey}` }
  let teamId: string | undefined

  const mgmtRes = await fetch('https://management-api.x.ai/auth/management-keys/validation', { headers })
  if (mgmtRes.ok) {
    const mgmt = await mgmtRes.json() as { teamId?: string; scopeId?: string }
    teamId = mgmt.teamId || mgmt.scopeId
  } else {
    const keyRes = await fetch('https://api.x.ai/v1/api-key', { headers })
    if (!keyRes.ok) {
      const body = await keyRes.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error || `xAI API error: ${keyRes.status}`)
    }
    const keyInfo = await keyRes.json() as { team_id?: string }
    teamId = keyInfo.team_id
  }

  let remaining: number | null = null
  let granted: number | null = null
  let periodSpend: number | null = null

  if (teamId) {
    try {
      const balanceRes = await fetch(
        `https://management-api.x.ai/v1/billing/teams/${teamId}/prepaid/balance`,
        { headers },
      )
      if (balanceRes.ok) {
        const balanceData = await balanceRes.json() as {
          total?: { val?: string }
          changes?: { changeOrigin?: string; amount?: { val?: string } }[]
        }
        const cents = parseInt(balanceData.total?.val ?? '', 10)
        if (Number.isFinite(cents)) {
          remaining = Math.abs(cents) / 100
          let totalPurchased = 0
          let totalSpent = 0
          for (const c of balanceData.changes ?? []) {
            const amt = parseInt(c.amount?.val ?? '0', 10)
            if (c.changeOrigin === 'PURCHASE') totalPurchased += Math.abs(amt)
            if (c.changeOrigin === 'SPEND') totalSpent += Math.abs(amt)
          }
          if (totalPurchased > 0) granted = totalPurchased / 100
          if (totalSpent > 0) periodSpend = totalSpent / 100
        }
      }
    } catch {
      // billing not accessible
    }
  }

  if (opts.creditGrant) {
    granted = opts.creditGrant
    if (remaining == null) remaining = opts.creditGrant
  }

  return {
    provider: 'xai',
    name: 'xAI (Grok)',
    granted,
    remaining,
    periodSpend,
    expiry: opts.creditExpiry ?? null,
  }
}
