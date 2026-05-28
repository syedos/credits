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

- **get_credits** — show all balances
- **add_provider** — add a provider (openai, anthropic, openrouter, xai, bedrock, vercel, supabase, neon)
- **remove_provider** — remove a provider
- **list_providers** — see supported providers

### Adding a provider

```
add_provider provider=openai api_key=sk-... credit_grant=10000 credit_expiry=2026-03-01
```

The `credit_grant` and `credit_expiry` fields are optional but help calculate remaining balance when the provider API doesn't expose it directly.

## How it works

- Polls each provider's billing/usage API directly
- Calculates remaining = grant - spend since grant date
- All keys stored in `~/.credits/config.json` (mode 0600)
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
