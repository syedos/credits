import type { CreditSnapshot, PollerOptions } from './types.js'

async function fetchSpend(apiKey: string, since: Date, until: Date): Promise<number> {
  if (since >= until) return 0

  const headers = { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  let spend = 0
  let url: string | null = `https://api.anthropic.com/v1/organizations/cost_report?starting_at=${since.toISOString()}&ending_at=${until.toISOString()}&bucket_width=1d&limit=100`

  while (url) {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Anthropic API error: ${res.status} ${body}`.trim())
    }

    const page = await res.json() as {
      data?: { results?: { amount?: string }[] }[]
      has_more?: boolean
      next_page?: string
    }

    if (page.data) {
      for (const bucket of page.data) {
        if (bucket.results) {
          for (const result of bucket.results) {
            spend += Number(result.amount ?? 0)
          }
        }
      }
    }

    if (page.has_more && page.next_page) {
      const base = new URL('https://api.anthropic.com/v1/organizations/cost_report')
      base.searchParams.set('starting_at', since.toISOString())
      base.searchParams.set('ending_at', until.toISOString())
      base.searchParams.set('bucket_width', '1d')
      base.searchParams.set('limit', '100')
      base.searchParams.set('page', page.next_page)
      url = base.toString()
    } else {
      url = null
    }
  }

  return spend
}

export async function pollAnthropic(opts: PollerOptions): Promise<CreditSnapshot> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  let periodSpend: number | null = null
  try {
    periodSpend = await fetchSpend(opts.apiKey, startOfMonth, now)
  } catch {
    // cost_report requires admin key
  }

  let remaining: number | null = null
  let granted: number | null = null

  if (opts.creditGrant) {
    granted = opts.creditGrant
    const grantDate = opts.creditGrantDate ?? startOfMonth

    if (grantDate >= now) {
      remaining = opts.creditGrant
    } else {
      try {
        const spendSince = await fetchSpend(opts.apiKey, grantDate, now)
        remaining = opts.creditGrant - spendSince
      } catch {
        remaining = periodSpend != null ? opts.creditGrant - periodSpend : opts.creditGrant
      }
    }
  }

  return {
    provider: 'anthropic',
    name: 'Anthropic',
    granted,
    remaining,
    periodSpend,
    expiry: opts.creditExpiry ?? null,
  }
}
