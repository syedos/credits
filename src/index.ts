#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { loadConfig, saveConfig, type ProviderConfig } from './config.js'
import { POLLERS, SUPPORTED_PROVIDERS, type CreditSnapshot } from './providers/index.js'
import { manualSnapshot, renderTable } from './render.js'

function resolveKind(p: ProviderConfig): 'manual' | 'api' {
  if (p.kind === 'manual' || p.kind === 'api') return p.kind
  return POLLERS[p.id] ? 'api' : 'manual'
}

function titleCase(id: string): string {
  return id.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const server = new McpServer({
  name: 'credits',
  version: '0.1.0',
})

server.tool(
  'get_credits',
  'Get remaining credit balances across all providers (manual grants + API-polled). Returns a table grouped by category with granted, remaining, monthly spend, and expiry.',
  {},
  async () => {
    const config = await loadConfig()
    if (config.providers.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No providers configured. Use add_provider to add your first provider (manual grants need no API key).',
        }],
      }
    }

    const snapshots: CreditSnapshot[] = []
    const errors: string[] = []

    await Promise.allSettled(
      config.providers.map(async (p) => {
        if (resolveKind(p) === 'api') {
          const poller = POLLERS[p.id]
          if (!poller) {
            errors.push(`${p.name}: no API integration for "${p.id}" — add it with kind:"manual" to track by hand`)
            return
          }
          try {
            const snap = await poller({
              apiKey: p.apiKey ?? '',
              creditGrant: p.creditGrant,
              creditGrantDate: p.creditGrant ? new Date(p.creditGrantDate ?? Date.now()) : undefined,
              creditExpiry: p.creditExpiry,
            })
            snap.name = p.name || snap.name
            snap.category = p.category
            snap.url = p.url
            snapshots.push(snap)
          } catch (err) {
            errors.push(`${p.name}: ${err instanceof Error ? err.message : String(err)}`)
          }
        } else {
          snapshots.push(manualSnapshot(p))
        }
      }),
    )

    // restore config order (allSettled resolves out of order)
    const order = new Map(config.providers.map((p, i) => [p.id, i]))
    snapshots.sort((a, b) => (order.get(a.provider) ?? 0) - (order.get(b.provider) ?? 0))

    let table = renderTable(snapshots, { decorate: !process.env.NO_COLOR })

    if (errors.length > 0) {
      table += `\n⚠ Errors:\n${errors.map(e => `  • ${e}`).join('\n')}\n`
    }

    return { content: [{ type: 'text', text: table }] }
  },
)

server.tool(
  'add_provider',
  'Add or update a provider to track credits for. Manual providers need no API key — just a grant amount and (optionally) a URL and category. Supported provider IDs with a key are polled live. Stored locally in ~/.credits/config.json.',
  {
    provider: z.string().describe('Provider ID slug, e.g. "openai", "azure", "modal", "baseten"'),
    name: z.string().optional().describe('Display name, e.g. "Microsoft for Startups"'),
    kind: z.enum(['manual', 'api']).optional().describe('"api" = live-polled (supported provider + key required); "manual" = static grant tracked by hand. Default: auto-detected.'),
    category: z.string().optional().describe('Group label, e.g. "AI / LLM", "Cloud", "Compute", "Infra", "Payments"'),
    url: z.string().optional().describe('Service URL to open from the table (billing/usage console)'),
    api_key: z.string().optional().describe('API key/credentials (only needed for api kind)'),
    credit_grant: z.number().optional().describe('Total credit grant in USD (e.g. 10000 for $10k)'),
    remaining: z.number().optional().describe('Current remaining balance in USD if known (manual only; seeds the spend log)'),
    credit_grant_date: z.string().optional().describe('Date credits were granted (ISO 8601, e.g. 2026-01-15)'),
    credit_expiry: z.string().optional().describe('Date credits expire (ISO 8601, e.g. 2027-01-15)'),
  },
  async ({ provider, name, kind, category, url, api_key, credit_grant, remaining, credit_grant_date, credit_expiry }) => {
    const config = await loadConfig()
    const meta = SUPPORTED_PROVIDERS.find(p => p.id === provider)
    const resolvedName = name ?? meta?.name ?? titleCase(provider)
    const hasPoller = !!POLLERS[provider]
    const resolvedKind: 'manual' | 'api' = kind ?? (hasPoller && api_key ? 'api' : 'manual')

    let granted = credit_grant ?? undefined
    let spend: ProviderConfig['spend']

    if (resolvedKind === 'manual') {
      if (granted == null && remaining != null) granted = remaining
      if (granted != null && remaining != null && remaining < granted) {
        spend = [{ date: credit_grant_date ?? today(), amount: granted - remaining, note: 'initial' }]
      } else {
        spend = []
      }
    }

    const existing = config.providers.findIndex(p => p.id === provider)

    // On update with no new grant/remaining, keep the existing manual spend log.
    if (existing >= 0 && resolvedKind === 'manual' && credit_grant == null && remaining == null) {
      spend = config.providers[existing].spend ?? []
    }

    const entry: ProviderConfig = {
      id: provider,
      name: resolvedName,
      kind: resolvedKind,
      category,
      url,
      apiKey: api_key,
      creditGrant: granted,
      creditGrantDate: credit_grant_date,
      creditExpiry: credit_expiry,
      spend: resolvedKind === 'manual' ? spend : undefined,
    }

    if (existing >= 0) {
      config.providers[existing] = entry
    } else {
      config.providers.push(entry)
    }

    await saveConfig(config)

    const detail = resolvedKind === 'api'
      ? 'API-polled'
      : `manual${granted != null ? `, $${granted.toLocaleString('en-US')} granted` : ''}`
    return {
      content: [{ type: 'text', text: `✓ ${resolvedName} saved (${detail}). Run get_credits to see balances.` }],
    }
  },
)

server.tool(
  'log_spend',
  'Record spend against a manual provider so its remaining balance draws down. Provide either amount (incremental spend) OR remaining (the new balance) — not both. Each call appends a dated entry, building a drawdown history.',
  {
    provider: z.string().describe('Provider ID to log spend for'),
    amount: z.number().optional().describe('Incremental amount spent in USD since the last entry'),
    remaining: z.number().optional().describe('New remaining balance in USD (the delta is computed for you)'),
    date: z.string().optional().describe('Date of this entry (ISO 8601). Default: today'),
    note: z.string().optional().describe('Optional note, e.g. "monthly inference"'),
  },
  async ({ provider, amount, remaining, date, note }) => {
    if ((amount == null) === (remaining == null)) {
      return { content: [{ type: 'text', text: 'Provide exactly one of: amount (spent) or remaining (new balance).' }] }
    }

    const config = await loadConfig()
    const idx = config.providers.findIndex(p => p.id === provider)
    if (idx < 0) {
      return { content: [{ type: 'text', text: `Provider "${provider}" not found. Add it first with add_provider.` }] }
    }

    const p = config.providers[idx]
    if (resolveKind(p) === 'api') {
      return { content: [{ type: 'text', text: `${p.name} is API-polled — its remaining comes from the provider's billing API, so manual spend isn't tracked. Re-add it with kind:"manual" to track it by hand.` }] }
    }

    const prior = (p.spend ?? []).reduce((acc, s) => acc + (Number(s.amount) || 0), 0)
    let delta: number
    if (amount != null) {
      delta = amount
    } else {
      if (p.creditGrant == null) {
        return { content: [{ type: 'text', text: `${p.name} has no grant amount set, so I can't derive spend from a remaining balance. Re-add it with credit_grant, or log spend with amount instead.` }] }
      }
      delta = (p.creditGrant - prior) - remaining!
    }

    p.spend = [...(p.spend ?? []), { date: date ?? today(), amount: delta, note }]
    config.providers[idx] = p
    await saveConfig(config)

    const newRemaining = p.creditGrant != null ? p.creditGrant - (prior + delta) : null
    const remStr = newRemaining != null ? `$${newRemaining.toLocaleString('en-US')}` : '—'
    const verb = delta >= 0 ? 'spend' : 'credit'
    return { content: [{ type: 'text', text: `✓ Logged ${verb} of $${Math.abs(delta).toLocaleString('en-US')} for ${p.name}. Remaining: ${remStr}.` }] }
  },
)

server.tool(
  'remove_provider',
  'Remove a provider from credit tracking.',
  {
    provider: z.string().describe('Provider ID to remove'),
  },
  async ({ provider }) => {
    const config = await loadConfig()
    const idx = config.providers.findIndex(p => p.id === provider)
    if (idx < 0) {
      return { content: [{ type: 'text', text: `Provider "${provider}" not found in config.` }] }
    }
    const name = config.providers[idx].name
    config.providers.splice(idx, 1)
    await saveConfig(config)
    return { content: [{ type: 'text', text: `✓ ${name} removed.` }] }
  },
)

server.tool(
  'list_providers',
  'List configured providers (manual + API) and the catalog of API-pollable providers.',
  {},
  async () => {
    const config = await loadConfig()
    let text = ''

    if (config.providers.length > 0) {
      text += 'Configured:\n\n'
      for (const p of config.providers) {
        const tag = resolveKind(p) === 'api' ? '[api]' : '[manual]'
        const cat = p.category ? ` · ${p.category}` : ''
        text += `  ${tag.padEnd(9)} ${p.name}${cat}\n`
      }
      text += '\n'
    }

    text += 'API-pollable catalog (use kind:"api" + key):\n\n'
    const configured = new Set(config.providers.map(p => p.id))
    for (const p of SUPPORTED_PROVIDERS) {
      const status = configured.has(p.id) ? '✓' : '○'
      text += `  ${status} ${p.name.padEnd(14)} — ${p.keyHint}\n`
    }
    text += '\nAnything else can be added as kind:"manual" (no key needed).\n'

    return { content: [{ type: 'text', text }] }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('Credits MCP server failed to start:', err)
  process.exit(1)
})
