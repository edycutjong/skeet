import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import { runFeed } from './feed.js';
import { AgentState } from './executor.js';
import { AgentConfig } from './types.js';

dotenv.config();

const STATE_FILE = '.agent.json';
const CONFIG_FILE = path.join('src', 'config.json');

async function api(pathStr: string, { method = 'GET', token, body }: { method?: string; token?: string; body?: any } = {}) {
  const API_ENDPOINT = 'https://alpha.creator.bid/api';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(API_ENDPOINT + pathStr, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { _raw: text }; }
  if (!r.ok) {
    const e = new Error(`${method} ${pathStr} → ${r.status}: ${data.error || text}`) as any;
    e.status = r.status;
    throw e;
  }
  return data;
}

async function getTokens(code: string): Promise<string> {
  const { token } = await api('/auth/login', {
    method: 'POST',
    body: { code }
  });
  return token;
}

async function loadOrBootstrap(accessCode: string): Promise<AgentState> {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as AgentState;
  }

  console.log('[INDEX] Bootstrapping fresh agent wallet and registering with Creatorbid...');
  const userJwt = await getTokens(accessCode);
  const wallet = ethers.Wallet.createRandom();
  console.log('[INDEX] Generated Signer EOA Address:', wallet.address);

  const registrationRes = await api('/agents/register', {
    method: 'POST',
    token: userJwt,
    body: {
      name: 'skeet-agent-' + wallet.address.slice(2, 10),
      address: wallet.address,
      archetype: 'Custom'
    }
  });

  if (!registrationRes.trading_safe) {
    throw new Error('Registration failed: no trading safe provisioned. Response: ' + JSON.stringify(registrationRes));
  }

  const state: AgentState = {
    name: registrationRes.name,
    pk: wallet.privateKey,
    address: wallet.address,
    agentJwt: registrationRes.token,
    tradingSafe: registrationRes.trading_safe,
    treasurySafe: registrationRes.treasury_safe,
    rolesMod: registrationRes.roles_modifier
  };

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  console.log(`[INDEX] Agent registered successfully! Trading Safe: ${state.tradingSafe}`);
  return state;
}

function loadConfig(): AgentConfig {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Config file ${CONFIG_FILE} not found`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as AgentConfig;
}

async function main() {
  const accessCode = process.env.BID_ACCESS_CODE;
  if (!accessCode) {
    console.error('[INDEX] ERROR: BID_ACCESS_CODE is not defined in .env');
    process.exit(1);
  }

  try {
    const state = await loadOrBootstrap(accessCode);
    const config = loadConfig();
    console.log(`[INDEX] Launching Skeet Daemon [${state.name}]...`);
    await runFeed(state, config);
  } catch (e: any) {
    console.error('[INDEX] Fatal error running daemon:', e.message);
    process.exit(1);
  }
}

main();
