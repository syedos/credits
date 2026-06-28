export interface CreditSnapshot {
  provider: string
  name: string
  granted: number | null
  remaining: number | null
  periodSpend: number | null
  expiry: string | null
  category?: string
  url?: string
  type?: 'credit' | 'perk'
  status?: 'active' | 'pending' | 'expired'
  use?: string
}

export interface PollerOptions {
  apiKey: string
  creditGrant?: number
  creditGrantDate?: Date
  creditExpiry?: string
}

export type Poller = (opts: PollerOptions) => Promise<CreditSnapshot>
