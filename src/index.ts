#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { loadConfig, saveConfig } from './config.js'
import { POLLERS, SUPPORTED_PROVIDERS, type CreditSnapshot } from './providers/index.js'

const server = new McpServer({
  name: 'credits',
  version: '0.1.0',
})

server.tool(
  'get_credits',
  'Get remaining credit balances across all configured providers. Returns a table of provider, granted, remaining, period spend, and expiry.',
  {},
  async () => {
    const config = await loadConfig()
    if (config.providers.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No providers configured. Use add_provider to add your first provider.\n\nSupported: ' +
            SUPPORTED_PROVIDERS.map(p => p.name).join(', '),
        }],
      }
    }

    const results: CreditSnapshot[] = []
    const errors: string[] = []

    await Promise.allSettled(
      config.providers.map(async (p) => {
        const poller = POLLERS[p.id]
        if (!poller) {
          errors.push(`${p.name}: unsupported provider "${p.id}"`)
          return
        }
        try {
          const snapshot = await poller({
            apiKey: p.apiKey,
            creditGrant: p.creditGrant,
            creditGrantDate: p.creditGrant ? new Date(p.creditGrantDate ?? Date.now()) : undefined,
            creditExpiry: p.creditExpiry,
          })
          results.push(snapshot)
        } catch (err) {
          errors.push(`${p.name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }),
    )

    const fmt = (v: number | null) => v != null ? `$${v.toFixed(2)}` : '—'

    let table = 'Provider        Granted      Remaining    Spend/mo     Expiry\n'
    table += '─'.repeat(70) + '\n'

    let totalGranted = 0
    let totalRemaining = 0
    let totalSpend = 0

    for (const r of results) {
      const name = r.name.padEnd(15)
      const granted = fmt(r.granted).padStart(11)
      const remaining = fmt(r.remaining).padStart(11)
      const spend = fmt(r.periodSpend).padStart(11)
      const expiry = r.expiry ?? '—'
      table += `${name} ${granted}  ${remaining}  ${spend}     ${expiry}\n`

      if (r.granted != null) totalGranted += r.granted
      if (r.remaining != null) totalRemaining += r.remaining
      if (r.periodSpend != null) totalSpend += r.periodSpend
    }

    table += '─'.repeat(70) + '\n'
    table += `${'Total'.padEnd(15)} ${fmt(totalGranted || null).padStart(11)}  ${fmt(totalRemaining || null).padStart(11)}  ${fmt(totalSpend || null).padStart(11)}\n`

    if (errors.length > 0) {
      table += `\n⚠ Errors:\n${errors.map(e => `  • ${e}`).join('\n')}\n`
    }

    return { content: [{ type: 'text', text: table }] }
  },
)

server.tool(
  'add_provider',
  'Add a provider to track credits for. Stores the API key locally in ~/.credits/config.json.',
  {
    provider: z.enum(SUPPORTED_PROVIDERS.map(p => p.id) as [string, ...string[]]).describe('Provider ID'),
    api_key: z.string().describe('API key or credentials for the provider'),
    credit_grant: z.number().optional().describe('Total credit grant amount in USD (e.g. 10000 for $10k)'),
    credit_grant_date: z.string().optional().describe('Date credits were granted (ISO 8601, e.g. 2025-01-15)'),
    credit_expiry: z.string().optional().describe('Date credits expire (ISO 8601, e.g. 2026-01-15)'),
  },
  async ({ provider, api_key, credit_grant, credit_grant_date, credit_expiry }) => {
    const config = await loadConfig()
    const meta = SUPPORTED_PROVIDERS.find(p => p.id === provider)
    const name = meta?.name ?? provider

    const existing = config.providers.findIndex(p => p.id === provider)
    const entry = {
      id: provider,
      name,
      apiKey: api_key,
      creditGrant: credit_grant,
      creditGrantDate: credit_grant_date,
      creditExpiry: credit_expiry,
    }

    if (existing >= 0) {
      config.providers[existing] = entry
    } else {
      config.providers.push(entry)
    }

    await saveConfig(config)
    return {
      content: [{ type: 'text', text: `✓ ${name} configured. Run get_credits to see balances.` }],
    }
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
  'List all supported providers and which ones are configured.',
  {},
  async () => {
    const config = await loadConfig()
    const configured = new Set(config.providers.map(p => p.id))

    let text = 'Supported providers:\n\n'
    for (const p of SUPPORTED_PROVIDERS) {
      const status = configured.has(p.id) ? '✓' : '○'
      text += `  ${status} ${p.name.padEnd(14)} — ${p.keyHint}\n`
    }
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
