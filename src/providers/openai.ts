import type { CreditSnapshot, PollerOptions } from './types.js'

async function fetchSpend(apiKey: string, sinceTs: number, untilTs: number): Promise<number> {
  if (sinceTs >= untilTs) return 0

  const headers = { Authorization: `Bearer ${apiKey}` }
  let spend = 0
  let url: string | null = `https://api.openai.com/v1/organization/costs?start_time=${sinceTs}&end_time=${untilTs}&bucket_width=1d&limit=30`

  while (url) {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`OpenAI API error: ${res.status} ${body}`.trim())
    }

    const page = await res.json() as {
      data?: { results?: { amount?: { value?: number } }[] }[]
      has_more?: boolean
      next_page?: string
    }

    if (page.data) {
      for (const bucket of page.data) {
        if (bucket.results) {
          for (const result of bucket.results) {
            spend += Number(result.amount?.value ?? 0)
          }
        }
      }
    }

    if (page.has_more && page.next_page) {
      const base = new URL('https://api.openai.com/v1/organization/costs')
      base.searchParams.set('start_time', String(sinceTs))
      base.searchParams.set('end_time', String(untilTs))
      base.searchParams.set('bucket_width', '1d')
      base.searchParams.set('limit', '30')
      base.searchParams.set('page', page.next_page)
      url = base.toString()
    } else {
      url = null
    }
  }

  return spend
}

export async function pollOpenAI(opts: PollerOptions): Promise<CreditSnapshot> {
  const now = Math.floor(Date.now() / 1000)
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const monthStart = Math.floor(startOfMonth.getTime() / 1000)

  let periodSpend: number | null = null
  try {
    periodSpend = await fetchSpend(opts.apiKey, monthStart, now)
  } catch {
    // costs endpoint may require admin key
  }

  let remaining: number | null = null
  let granted: number | null = null

  if (opts.creditGrant) {
    granted = opts.creditGrant
    const grantTs = opts.creditGrantDate
      ? Math.floor(opts.creditGrantDate.getTime() / 1000)
      : monthStart

    if (grantTs >= now) {
      remaining = opts.creditGrant
    } else {
      try {
        const spendSince = await fetchSpend(opts.apiKey, grantTs, now)
        remaining = opts.creditGrant - spendSince
      } catch {
        remaining = periodSpend != null ? opts.creditGrant - periodSpend : opts.creditGrant
      }
    }
  }

  return {
    provider: 'openai',
    name: 'OpenAI',
    granted,
    remaining,
    periodSpend,
    expiry: opts.creditExpiry ?? null,
  }
}
