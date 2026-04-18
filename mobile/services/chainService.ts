import { ethers } from 'ethers';
import * as bip39 from 'bip39';
import * as ed from '@noble/ed25519';
import bs58 from 'bs58';
import { Buffer } from 'buffer';

export type Chain = 'ethereum' | 'bnb' | 'polygon' | 'solana';
export type Network = 'mainnet' | 'testnet';

export interface ChainMeta {
  id: Chain;
  name: string;
  symbol: string;
  decimals: number;
  coingeckoId: string;
}

// Network-independent display info. Kept as a separate record so UI code
// (Home / Send / History) doesn't have to care which network is currently
// selected when it just wants to render "ETH" or show the right decimals.
export const CHAIN_META: Record<Chain, ChainMeta> = {
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    coingeckoId: 'ethereum',
  },
  bnb: {
    id: 'bnb',
    name: 'BNB Chain',
    symbol: 'BNB',
    decimals: 18,
    coingeckoId: 'binancecoin',
  },
  polygon: {
    id: 'polygon',
    name: 'Polygon',
    symbol: 'MATIC',
    decimals: 18,
    coingeckoId: 'matic-network',
  },
  solana: {
    id: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    decimals: 9,
    coingeckoId: 'solana',
  },
};

export interface NetworkMeta {
  label: string;
  rpc: string;
  explorerApi?: string;
  explorerTx: (hash: string) => string;
  chainId?: number; // EVM only
  faucet?: string;
}

// Public, no-key endpoints for each (chain, network) pair. If any becomes
// rate-limited we can swap the RPC without touching call sites.
export const NETWORK_META: Record<Network, Record<Chain, NetworkMeta>> = {
  mainnet: {
    ethereum: {
      label: 'Mainnet',
      rpc: 'https://ethereum-rpc.publicnode.com',
      explorerApi: 'https://api.etherscan.io/api',
      explorerTx: (h) => `https://etherscan.io/tx/${h}`,
      chainId: 1,
    },
    bnb: {
      label: 'Mainnet',
      rpc: 'https://bsc-rpc.publicnode.com',
      explorerApi: 'https://api.bscscan.com/api',
      explorerTx: (h) => `https://bscscan.com/tx/${h}`,
      chainId: 56,
    },
    polygon: {
      label: 'Mainnet',
      rpc: 'https://polygon-bor-rpc.publicnode.com',
      explorerApi: 'https://api.polygonscan.com/api',
      explorerTx: (h) => `https://polygonscan.com/tx/${h}`,
      chainId: 137,
    },
    solana: {
      label: 'Mainnet',
      rpc: 'https://solana-rpc.publicnode.com',
      explorerTx: (h) => `https://solscan.io/tx/${h}`,
    },
  },
  testnet: {
    ethereum: {
      label: 'Sepolia',
      rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
      explorerApi: 'https://api-sepolia.etherscan.io/api',
      explorerTx: (h) => `https://sepolia.etherscan.io/tx/${h}`,
      chainId: 11155111,
      faucet: 'https://www.alchemy.com/faucets/ethereum-sepolia',
    },
    bnb: {
      label: 'BSC Testnet',
      rpc: 'https://bsc-testnet-rpc.publicnode.com',
      explorerApi: 'https://api-testnet.bscscan.com/api',
      explorerTx: (h) => `https://testnet.bscscan.com/tx/${h}`,
      chainId: 97,
      faucet: 'https://www.bnbchain.org/en/testnet-faucet',
    },
    polygon: {
      label: 'Amoy',
      rpc: 'https://polygon-amoy-bor-rpc.publicnode.com',
      explorerApi: 'https://api-amoy.polygonscan.com/api',
      explorerTx: (h) => `https://amoy.polygonscan.com/tx/${h}`,
      chainId: 80002,
      faucet: 'https://faucet.polygon.technology/',
    },
    solana: {
      label: 'Devnet',
      rpc: 'https://api.devnet.solana.com',
      // Solscan accepts ?cluster=devnet for devnet inspection.
      explorerTx: (h) => `https://solscan.io/tx/${h}?cluster=devnet`,
      faucet: 'https://faucet.solana.com/',
    },
  },
};

export function getNetworkMeta(chain: Chain, network: Network): NetworkMeta {
  return NETWORK_META[network][chain];
}

const EVM_CHAINS: Chain[] = ['ethereum', 'bnb', 'polygon'];

// ---- Balance reads -------------------------------------------------------

export async function getNativeBalance(
  chain: Chain,
  address: string,
  network: Network = 'mainnet'
): Promise<number> {
  if (!address) return 0;
  const net = getNetworkMeta(chain, network);
  if (chain === 'solana') return getSolanaBalance(address, net.rpc);
  const provider = new ethers.JsonRpcProvider(net.rpc);
  const wei = await provider.getBalance(address);
  return Number(ethers.formatUnits(wei, CHAIN_META[chain].decimals));
}

async function rpc(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'RPC error');
  return json.result;
}

async function getSolanaBalance(address: string, rpcUrl: string): Promise<number> {
  const lamports = (await rpc(rpcUrl, {
    jsonrpc: '2.0',
    id: 1,
    method: 'getBalance',
    params: [address],
  })).value as number;
  return lamports / 1e9;
}

// ---- EVM send ------------------------------------------------------------

export async function sendEvmNative(
  chain: Chain,
  mnemonic: string,
  to: string,
  amount: string,
  network: Network = 'mainnet'
): Promise<string> {
  if (!EVM_CHAINS.includes(chain)) throw new Error(`sendEvmNative: wrong chain ${chain}`);
  if (!ethers.isAddress(to)) throw new Error('Invalid recipient address');
  const net = getNetworkMeta(chain, network);
  const provider = new ethers.JsonRpcProvider(net.rpc);
  const wallet = ethers.Wallet.fromPhrase(mnemonic.trim()).connect(provider);
  const value = ethers.parseUnits(amount, CHAIN_META[chain].decimals);
  const tx = await wallet.sendTransaction({ to, value });
  return tx.hash;
}

// ---- Solana send ---------------------------------------------------------
//
// We deliberately avoid @solana/web3.js to keep the RN bundle small and
// to skip the historical build friction that library has. The transfer
// format is stable and short; we build + sign it with the primitives we
// already depend on (buffer, bs58, @noble/ed25519, @noble/hashes).

const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

function encodeCompactU16(n: number): number[] {
  const out: number[] = [];
  let v = n;
  while (true) {
    const b = v & 0x7f;
    v >>= 7;
    if (v === 0) {
      out.push(b);
      return out;
    }
    out.push(b | 0x80);
  }
}

function writeU64LE(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let v = n;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

async function solanaKeypairFromMnemonic(mnemonic: string) {
  const seed = bip39.mnemonicToSeedSync(mnemonic.trim()).slice(0, 32);
  const pub = await ed.getPublicKeyAsync(seed);
  return { secret: seed, publicKey: pub };
}

export async function sendSolanaNative(
  mnemonic: string,
  to: string,
  amount: string,
  network: Network = 'mainnet'
): Promise<string> {
  const lamports = BigInt(Math.round(parseFloat(amount) * 1e9));
  if (lamports <= 0n) throw new Error('Invalid amount');

  const toPub = bs58.decode(to);
  if (toPub.length !== 32) throw new Error('Invalid recipient address');

  const { secret, publicKey: fromPub } = await solanaKeypairFromMnemonic(mnemonic);
  const systemPub = bs58.decode(SYSTEM_PROGRAM_ID);
  const rpcUrl = getNetworkMeta('solana', network).rpc;

  const blockhashB58: string = (await rpc(rpcUrl, {
    jsonrpc: '2.0',
    id: 1,
    method: 'getLatestBlockhash',
    params: [{ commitment: 'confirmed' }],
  })).value.blockhash;
  const blockhash = bs58.decode(blockhashB58);

  // Transaction message layout (v0 legacy):
  //   header (3 bytes): numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned
  //   compactU16 account-keys count
  //   account keys (32 bytes each): [fromPub, toPub, systemProgram]
  //   blockhash (32 bytes)
  //   compactU16 instruction count
  //   per instruction: programIdIndex, compactU16 accountCount, account indices,
  //                    compactU16 dataLen, data bytes
  const accounts = [fromPub, toPub, systemPub];
  const header = new Uint8Array([1, 0, 1]);
  const keysCount = encodeCompactU16(accounts.length);

  const instrData = new Uint8Array(12);
  // SystemProgram Transfer instruction: [0x02, 0x00, 0x00, 0x00] then u64 lamports LE
  instrData[0] = 2;
  instrData.set(writeU64LE(lamports), 4);

  const instruction = new Uint8Array([
    2, // program id index (system program)
    ...encodeCompactU16(2), // 2 accounts referenced
    0,
    1, // from, to
    ...encodeCompactU16(instrData.length),
    ...instrData,
  ]);

  const message = new Uint8Array([
    ...header,
    ...keysCount,
    ...accounts.reduce<number[]>((a, b) => a.concat(Array.from(b)), []),
    ...blockhash,
    ...encodeCompactU16(1),
    ...instruction,
  ]);

  const signature = await ed.signAsync(message, secret);

  // Transaction = compactU16 signature count + signatures + message
  const signatures = new Uint8Array([...encodeCompactU16(1), ...signature]);
  const transaction = new Uint8Array([...signatures, ...message]);
  const txBase64 = Buffer.from(transaction).toString('base64');

  const signatureB58: string = await rpc(rpcUrl, {
    jsonrpc: '2.0',
    id: 1,
    method: 'sendTransaction',
    params: [txBase64, { encoding: 'base64', skipPreflight: false }],
  });
  return signatureB58;
}

// Sanity helper for callers who want to detect malformed input before they
// bother the user with a confirmation sheet. Recipient format doesn't
// change with network, so this stays network-less.
export function isValidRecipient(chain: Chain, address: string): boolean {
  if (!address) return false;
  if (chain === 'solana') {
    try {
      return bs58.decode(address).length === 32;
    } catch {
      return false;
    }
  }
  return ethers.isAddress(address);
}

// ---- Transaction history ------------------------------------------------

export interface TxRow {
  hash: string;
  timestamp: number; // ms
  from: string;
  to: string;
  value: number; // native units
  symbol: string;
  direction: 'in' | 'out' | 'self';
  status: 'success' | 'failed' | 'pending';
  explorerUrl: string;
}

async function evmHistory(
  chain: Chain,
  address: string,
  network: Network,
  apiKey?: string
): Promise<TxRow[]> {
  const net = getNetworkMeta(chain, network);
  const meta = CHAIN_META[chain];
  if (!net.explorerApi) return [];
  const params = new URLSearchParams({
    module: 'account',
    action: 'txlist',
    address,
    startblock: '0',
    endblock: '99999999',
    page: '1',
    offset: '25',
    sort: 'desc',
  });
  if (apiKey) params.set('apikey', apiKey);
  const url = `${net.explorerApi}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({}));
  if (json.status !== '1' || !Array.isArray(json.result)) return [];
  const me = address.toLowerCase();
  return (json.result as any[]).map((t): TxRow => {
    const from = String(t.from);
    const to = String(t.to);
    const dir: TxRow['direction'] =
      from.toLowerCase() === me && to.toLowerCase() === me
        ? 'self'
        : from.toLowerCase() === me
          ? 'out'
          : 'in';
    return {
      hash: String(t.hash),
      timestamp: Number(t.timeStamp) * 1000,
      from,
      to,
      value: Number(ethers.formatUnits(String(t.value || '0'), meta.decimals)),
      symbol: meta.symbol,
      direction: dir,
      status: String(t.isError) === '0' ? 'success' : 'failed',
      explorerUrl: net.explorerTx(String(t.hash)),
    };
  });
}

async function solanaHistory(address: string, network: Network): Promise<TxRow[]> {
  const net = getNetworkMeta('solana', network);
  const meta = CHAIN_META.solana;
  const sigs: any[] = await rpc(net.rpc, {
    jsonrpc: '2.0',
    id: 1,
    method: 'getSignaturesForAddress',
    params: [address, { limit: 20 }],
  });
  if (!Array.isArray(sigs) || sigs.length === 0) return [];
  return sigs.map((s): TxRow => ({
    hash: String(s.signature),
    timestamp: (Number(s.blockTime) || 0) * 1000,
    from: address,
    to: '',
    value: 0, // parsing each tx for the precise delta is expensive; leave 0
    symbol: meta.symbol,
    direction: 'self',
    status: s.err ? 'failed' : 'success',
    explorerUrl: net.explorerTx(String(s.signature)),
  }));
}

export async function getHistory(
  chain: Chain,
  address: string,
  network: Network = 'mainnet',
  apiKey?: string
): Promise<TxRow[]> {
  if (!address) return [];
  try {
    if (chain === 'solana') return await solanaHistory(address, network);
    return await evmHistory(chain, address, network, apiKey);
  } catch {
    return [];
  }
}
