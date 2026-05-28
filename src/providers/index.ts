import type { CreditSnapshot, Poller, PollerOptions } from './types.js'
import { pollOpenAI } from './openai.js'
import { pollAnthropic } from './anthropic.js'
import { pollOpenRouter } from './openrouter.js'
import { pollXAI } from './xai.js'
import { pollBedrock } from './bedrock.js'
import { pollVercel } from './vercel.js'
import { pollSupabase } from './supabase.js'
import { pollNeon } from './neon.js'

export type { CreditSnapshot, PollerOptions, Poller }

export const POLLERS: Record<string, Poller> = {
  openai: pollOpenAI,
  anthropic: pollAnthropic,
  openrouter: pollOpenRouter,
  xai: pollXAI,
  bedrock: pollBedrock,
  vercel: pollVercel,
  supabase: pollSupabase,
  neon: pollNeon,
}

export const SUPPORTED_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', keyHint: 'Admin API key from platform.openai.com' },
  { id: 'anthropic', name: 'Anthropic', keyHint: 'Admin API key from console.anthropic.com' },
  { id: 'openrouter', name: 'OpenRouter', keyHint: 'API key from openrouter.ai/keys' },
  { id: 'xai', name: 'xAI (Grok)', keyHint: 'API key or management key from x.ai' },
  { id: 'bedrock', name: 'AWS Bedrock', keyHint: 'JSON: {"accessKeyId":"...","secretAccessKey":"...","region":"us-east-1"}' },
  { id: 'vercel', name: 'Vercel', keyHint: 'Personal access token from vercel.com/account/tokens' },
  { id: 'supabase', name: 'Supabase', keyHint: 'Access token from supabase.com/dashboard/account/tokens' },
  { id: 'neon', name: 'Neon', keyHint: 'API key from console.neon.tech/app/settings/api-keys' },
] as const
