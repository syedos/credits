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

const COL = { name: 24, num: 13, exp: 11 }

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
  }
}

function money(v: number | null): string {
  return v != null
    ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'
}

function isExpired(expiry: string | null | undefined): boolean {
  if (!expiry) return false
  const d = new Date(expiry)
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now()
}

function remainingColor(s: CreditSnapshot): string {
  if (isExpired(s.expiry)) return STYLE.red
  if (s.granted == null || s.remaining == null || s.granted <= 0) return ''
  const ratio = s.remaining / s.granted
  if (ratio >= 0.5) return STYLE.green
  if (ratio >= 0.25) return STYLE.yellow
  return STYLE.red
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

export interface RenderOptions {
  decorate?: boolean
}

export function renderTable(snapshots: CreditSnapshot[], opts: RenderOptions = {}): string {
  const decorate = opts.decorate ?? true
  const indent = '  '

  const headcells =
    padEndV('Provider', COL.name) + '  ' +
    padStartV('Granted', COL.num) + '  ' +
    padStartV('Remaining', COL.num) + '  ' +
    padStartV('Spend/mo', COL.num) + '  ' +
    padEndV('Expiry', COL.exp)
  const rule = '─'.repeat(indent.length + headcells.length + 2)

  let out = ''
  out += indent + (decorate ? STYLE.dim : '') + headcells + (decorate ? STYLE.reset : '') + '\n'
  out += rule + '\n'

  // group by category, preserving first-seen order
  const groups: { cat: string; rows: CreditSnapshot[] }[] = []
  const byCat = new Map<string, CreditSnapshot[]>()
  for (const s of snapshots) {
    const cat = s.category && s.category.trim() ? s.category : 'Other'
    if (!byCat.has(cat)) {
      const arr: CreditSnapshot[] = []
      byCat.set(cat, arr)
      groups.push({ cat, rows: arr })
    }
    byCat.get(cat)!.push(s)
  }

  let tg = 0, tr = 0, ts = 0
  let hasG = false, hasR = false, hasS = false

  for (const g of groups) {
    out += '\n' + indent + (decorate ? STYLE.dim : '') + g.cat.toUpperCase() + (decorate ? STYLE.reset : '') + '\n'
    for (const s of g.rows) {
      const nameText = s.name.length > COL.name ? s.name.slice(0, COL.name - 1) + '…' : s.name
      const nameCell = padEndV(nameText, COL.name)
      const grantedCell = padStartV(money(s.granted), COL.num)

      const remPlain = padStartV(money(s.remaining), COL.num)
      let remCell = decorate ? `${STYLE.bold}${remainingColor(s)}${remPlain}${STYLE.reset}` : remPlain
      remCell = hyperlink(s.url, remCell, decorate)

      const spendCell = padStartV(money(s.periodSpend), COL.num)

      let expCell = padEndV(s.expiry ?? '—', COL.exp)
      if (decorate && isExpired(s.expiry)) expCell = `${STYLE.red}${expCell}${STYLE.reset}`

      const arrow = s.url ? hyperlink(s.url, '↗', decorate) : ' '

      out += indent + nameCell + '  ' + grantedCell + '  ' + remCell + '  ' + spendCell + '  ' + expCell + '  ' + arrow + '\n'

      if (s.granted != null) { tg += s.granted; hasG = true }
      if (s.remaining != null) { tr += s.remaining; hasR = true }
      if (s.periodSpend != null) { ts += s.periodSpend; hasS = true }
    }
  }

  out += rule + '\n'
  out += indent +
    padEndV('Total', COL.name) + '  ' +
    padStartV(money(hasG ? tg : null), COL.num) + '  ' +
    (decorate ? STYLE.bold : '') + padStartV(money(hasR ? tr : null), COL.num) + (decorate ? STYLE.reset : '') + '  ' +
    padStartV(money(hasS ? ts : null), COL.num) + '\n'

  return out
}
