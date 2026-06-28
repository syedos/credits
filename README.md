# credits

See all your startup API credits in one terminal command.

```
Provider        Granted      Remaining    Spend/mo     Expiry
──────────────────────────────────────────────────────────────────────
OpenAI            $10,000.00    $7,200.00    $1,400.00     2026-03-01
Anthropic         $25,000.00   $18,100.00    $4,500.00     2026-06-30
AWS Bedrock      $100,000.00   $72,340.00    $8,200.00     2026-12-31
Vercel             $3,500.00    $3,100.00       $80.00     —
──────────────────────────────────────────────────────────────────────
Total            $138,500.00  $100,740.00   $14,180.00
```

Local-only MCP server. Keys never leave your machine.

## Install

Add to your Claude Code MCP config (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "credits": {
      "command": "node",
      "args": ["/path/to/credits/dist/index.js"]
    }
  }
}
```

Or clone and build:

```bash
git clone https://github.com/syedos/credits.git
cd credits
npm install && npm run build
```

## Usage

Once the MCP server is running, use these tools in any MCP-compatible client:

- **get_credits** — show all balances, grouped by category
- **add_provider** — add any provider: a *manual* grant (no key) or an *API-polled* one (openai, anthropic, openrouter, xai, bedrock, vercel, supabase, neon)
- **log_spend** — draw down a manual provider's balance
- **remove_provider** — remove a provider
- **list_providers** — see configured + API-pollable providers

### Adding a provider

Two kinds of providers:

**Manual** — most startup credits (Azure, Modal, Baseten, Google Cloud…) have no balance API. Just record the grant; no key needed:

```
add_provider provider=modal name=Modal category=Compute url=https://modal.com/settings/usage credit_grant=5000
```

Draw it down over time as you spend:

```
log_spend provider=modal amount=300        # spent $300
log_spend provider=modal remaining=4200    # or set the new balance — the delta is computed for you
```

Remaining is always `granted − Σ(spend)`, and every entry is dated, so you get a drawdown history for free.

**API-polled** — supported providers fetch remaining live from their billing API:

```
add_provider provider=openai api_key=sk-... credit_grant=10000 credit_expiry=2026-03-01
```

The `credit_grant` and `credit_expiry` fields help calculate remaining balance when the provider API doesn't expose it directly.

## How it works

- **Manual providers**: remaining = `granted − Σ(logged spend)`, tracked entirely in local config — no key required
- **API providers**: poll the provider's billing/usage API; remaining = grant − spend since grant date
- The table is grouped by category, with the remaining balance color-coded and linked to each service
- All config/keys stored in `~/.credits/config.json` (mode 0600)
- No backend, no SaaS, no telemetry

## Supported Providers

| Provider | What it reads |
|----------|---------------|
| OpenAI | `/v1/organization/costs` |
| Anthropic | `/v1/organizations/cost_report` |
| OpenRouter | `/api/v1/credits` (direct balance) |
| xAI | Management API prepaid balance |
| AWS Bedrock | Cost Explorer (Bedrock service) |
| Vercel | Billing usage endpoint |
| Supabase | Organization billing/usage |
| Neon | Consumption/projects |

## License

MIT
