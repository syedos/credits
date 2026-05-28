import { CostExplorerClient, GetCostAndUsageCommand } from '@aws-sdk/client-cost-explorer'
import type { CreditSnapshot, PollerOptions } from './types.js'

function parseAwsCredential(raw: string): { accessKeyId: string; secretAccessKey: string; region: string } {
  const parsed = JSON.parse(raw)
  if (!parsed.accessKeyId || !parsed.secretAccessKey) {
    throw new Error('Credential JSON must include accessKeyId and secretAccessKey')
  }
  return {
    accessKeyId: parsed.accessKeyId,
    secretAccessKey: parsed.secretAccessKey,
    region: parsed.region || 'us-east-1',
  }
}

export async function pollBedrock(opts: PollerOptions): Promise<CreditSnapshot> {
  const creds = parseAwsCredential(opts.apiKey)
  const credentials = { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endDate = new Date(now)
  endDate.setDate(endDate.getDate() + 1)
  const monthPeriod = {
    Start: startOfMonth.toISOString().split('T')[0],
    End: endDate.toISOString().split('T')[0],
  }

  const ceClient = new CostExplorerClient({ region: 'us-east-1', credentials })

  const grossResponse = await ceClient.send(new GetCostAndUsageCommand({
    TimePeriod: monthPeriod,
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    Filter: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Usage'] } },
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
  }))

  let periodSpend = 0
  for (const result of grossResponse.ResultsByTime ?? []) {
    for (const group of result.Groups ?? []) {
      const service = ((group.Keys ?? [])[0] ?? '').toLowerCase()
      if (service.includes('bedrock')) {
        periodSpend += parseFloat(group.Metrics?.UnblendedCost?.Amount ?? '0')
      }
    }
  }

  let remaining: number | null = null
  let granted: number | null = null

  if (opts.creditGrant) {
    granted = opts.creditGrant
    const sinceDay = (opts.creditGrantDate ?? startOfMonth).toISOString().split('T')[0]
    const endDay = endDate.toISOString().split('T')[0]

    if (sinceDay >= endDay) {
      remaining = opts.creditGrant
    } else {
      const sincePeriod = { Start: sinceDay, End: endDay }
      try {
        const creditsResponse = await ceClient.send(new GetCostAndUsageCommand({
          TimePeriod: sincePeriod,
          Granularity: 'MONTHLY',
          Metrics: ['UnblendedCost'],
          Filter: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Credit'] } },
        }))
        let creditsBurned = 0
        for (const result of creditsResponse.ResultsByTime ?? []) {
          creditsBurned += Math.abs(parseFloat(result.Total?.UnblendedCost?.Amount ?? '0'))
        }
        remaining = opts.creditGrant - creditsBurned
      } catch {
        remaining = null
      }
    }
  }

  return {
    provider: 'bedrock',
    name: 'AWS Bedrock',
    granted,
    remaining,
    periodSpend,
    expiry: opts.creditExpiry ?? null,
  }
}
