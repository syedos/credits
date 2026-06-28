import type { CreditSnapshot } from './providers/types.js'
import type { ProviderConfig, SpendEntry } from './config.js'

const ESC = '\x1b'
const STYLE = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
  red: `${ESC}[31m`,
}

const COL = { name: 22, num: 12, status: 9, use: 11 }

export function sumSpend(spend?: SpendEntry[]): number {
  return (spend ?? []).reduce((acc, s) => acc + (Number(s.amount) || 0), 0)
}

export function monthSpend(spend: SpendEntry[] | undefined, ref = new Date()): number {
  return (spend ?? []).reduce((acc, s) => {
    const d = new Date(s.date)
    if (!Number.isNaN(d.getTime()) && d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()) {
      return acc + (Number(s.amount) || 0)
    }
    return acc
  }, 0)
}

export function manualSnapshot(p: ProviderConfig): CreditSnapshot {
  const granted = p.creditGrant ?? null
  const spent = sumSpend(p.spend)
  return {
    provider: p.id,
    name: p.name,
    granted,
    remaining: granted != null ? granted - spent : null,
    periodSpend: p.spend && p.spend.length ? monthSpend(p.spend) : null,
    expiry: p.creditExpiry ?? null,
    category: p.category,
    url: p.url,
    type: p.type,
    status: p.status,
    use: p.use,
  }
}

function money(v: number | null): string {
  return v != null
    ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'
}

function hyperlink(url: string | undefined, text: string, on: boolean): string {
  if (!on || !url) return text
  return `${ESC}]8;;${url}${ESC}\\${text}${ESC}]8;;${ESC}\\`
}

function padEndV(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

function padStartV(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

type Status = 'active' | 'pending' | 'expired'

function statusOf(s: CreditSnapshot): Status {
  return s.status === 'pending' || s.status === 'expired' ? s.status : 'active'
}

function statusColor(st: Status): string {
  if (st === 'active') return STYLE.green
  if (st === 'pending') return STYLE.yellow
  return STYLE.red
}

function remainingColor(s: CreditSnapshot): string {
  const st = statusOf(s)
  if (st === 'expired') return STYLE.red
  if (st === 'pending') return STYLE.dim
  if (s.granted == null || s.remaining == null || s.granted <= 0) return ''
  const ratio = s.remaining / s.granted
  if (ratio >= 0.5) return STYLE.green
  if (ratio >= 0.25) return STYLE.yellow
  return STYLE.red
}

export interface RenderOptions {
  decorate?: boolean
}

function headerRow(decorate: boolean): string {
  const cells =
    padEndV('Provider', COL.name) + '  ' +
    padStartV('Granted', COL.num) + '  ' +
    padStartV('Remaining', COL.num) + '  ' +
    padEndV('Status', COL.status) + '  ' +
    padEndV('Use', COL.use)
  return (decorate ? STYLE.dim : '') + cells + (decorate ? STYLE.reset : '')
}

function dataRow(s: CreditSnapshot, decorate: boolean): string {
  const nameCell = padEndV(clip(s.name, COL.name), COL.name)
  const grantedCell = padStartV(money(s.granted), COL.num)

  const remPlain = padStartV(money(s.remaining), COL.num)
  let remCell = decorate ? `${STYLE.bold}${remainingColor(s)}${remPlain}${STYLE.reset}` : remPlain
  remCell = hyperlink(s.url, remCell, decorate)

  const st = statusOf(s)
  const stPlain = padEndV(st, COL.status)
  const stCell = decorate ? `${statusColor(st)}${stPlain}${STYLE.reset}` : stPlain

  const useCell = padEndV(s.use ?? s.category ?? '—', COL.use)
  const arrow = s.url ? hyperlink(s.url, '↗', decorate) : ' '

  return nameCell + '  ' + grantedCell + '  ' + remCell + '  ' + stCell + '  ' + useCell + '  ' + arrow
}

export function renderTable(snapshots: CreditSnapshot[], opts: RenderOptions = {}): string {
  const decorate = opts.decorate ?? true
  const indent = '  '

  const credits = snapshots.filter(s => s.type !== 'perk')
  const perks = snapshots.filter(s => s.type === 'perk')

  const rank: Record<Status, number> = { active: 0, pending: 1, expired: 2 }
  credits.sort((a, b) => {
    const ra = rank[statusOf(a)]
    const rb = rank[statusOf(b)]
    if (ra !== rb) return ra - rb
    return (b.remaining ?? -1) - (a.remaining ?? -1)
  })

  const header = headerRow(decorate)
  const visibleLen = header.replace(/\x1b\[[0-9]*m/g, '').length
  const rule = '─'.repeat(indent.length + visibleLen + 2)

  let out = ''
  out += indent + header + '\n'
  out += rule + '\n'

  for (const s of credits) out += indent + dataRow(s, decorate) + '\n'

  let totalGranted = 0
  let totalRemaining = 0
  let pendingRemaining = 0
  for (const s of credits) {
    const st = statusOf(s)
    if (st === 'active') {
      if (s.granted != null) totalGranted += s.granted
      if (s.remaining != null) totalRemaining += s.remaining
    } else if (st === 'pending' && s.remaining != null) {
      pendingRemaining += s.remaining
    }
  }

  out += rule + '\n'
  out += indent +
    padEndV('Total (active)', COL.name) + '  ' +
    padStartV(money(totalGranted), COL.num) + '  ' +
    (decorate ? STYLE.bold : '') + padStartV(money(totalRemaining), COL.num) + (decorate ? STYLE.reset : '') + '\n'
  if (pendingRemaining > 0) {
    out += indent +
      padEndV('Pending', COL.name) + '  ' +
      padStartV('—', COL.num) + '  ' +
      (decorate ? STYLE.dim : '') + padStartV(money(pendingRemaining), COL.num) + (decorate ? STYLE.reset : '') + '\n'
  }

  if (perks.length) {
    out += '\n' + indent + (decorate ? STYLE.dim : '') + 'PERKS (non-cash)' + (decorate ? STYLE.reset : '') + '\n'
    for (const s of perks) out += indent + dataRow(s, decorate) + '\n'
  }

  return out
}
