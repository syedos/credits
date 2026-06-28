import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type ProviderKind = 'manual' | 'api'

export interface SpendEntry {
  date: string
  amount: number
  note?: string
}

export type CreditType = 'credit' | 'perk'
export type GrantStatus = 'active' | 'pending' | 'expired'

export interface ProviderConfig {
  id: string
  name: string
  kind?: ProviderKind
  type?: CreditType
  status?: GrantStatus
  use?: string
  category?: string
  url?: string
  apiKey?: string
  apiKeyEnv?: string
  creditGrant?: number
  creditGrantDate?: string
  creditExpiry?: string
  spend?: SpendEntry[]
}

export interface Config {
  providers: ProviderConfig[]
}

const CONFIG_DIR = join(homedir(), '.credits')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export async function loadConfig(): Promise<Config> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8')
    return JSON.parse(raw) as Config
  } catch {
    return { providers: [] }
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export function getConfigPath(): string {
  return CONFIG_PATH
}
