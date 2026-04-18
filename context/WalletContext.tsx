import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  deriveAddresses,
  saveWalletToStorage,
  loadWalletFromStorage,
  clearWalletFromStorage,
  savePin,
  getPin,
  getBiometricEnabled,
  saveBiometricEnabled,
  WalletAddresses,
} from '../mobile/services/walletService';
import { CHAIN_META, Chain, getNativeBalance } from '../mobile/services/chainService';
import { getPrices, PriceInfo } from '../mobile/services/priceService';

export type Blockchain = Chain;
export type Network = 'mainnet' | 'testnet';

export interface Token {
  id: string;
  name: string;
  symbol: string;
  balance: number;
  balanceUSD: number;
  change24h: number;
  contractAddress?: string;
  decimals?: number;
  logo?: string;
  blockchain: Blockchain;
}

interface WalletContextType {
  isWalletCreated: boolean;
  setIsWalletCreated: (value: boolean) => void;
  pin: string | null;
  setPin: (value: string) => Promise<void>;
  seedPhrase: string[];
  setSeedPhrase: (value: string[]) => void;
  selectedBlockchain: Blockchain;
  setSelectedBlockchain: (value: Blockchain) => void;
  network: Network;
  setNetwork: (value: Network) => void;
  tokens: Token[];
  addToken: (token: Token) => void;
  walletAddress: string;
  walletAddresses: WalletAddresses | null;
  initWallet: (mnemonic: string) => Promise<void>;
  isLoadingBalances: boolean;
  lastRefreshedAt: number | null;
  refreshBalances: () => Promise<void>;
  prices: Partial<Record<Blockchain, PriceInfo>>;
  biometricEnabled: boolean;
  setBiometricEnabled: (value: boolean) => Promise<void>;
  autoLockTimer: number;
  setAutoLockTimer: (value: number) => void;
  isLocked: boolean;
  setIsLocked: (value: boolean) => void;
  resetWallet: () => Promise<void>;
  isLoading: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const CHAINS: Blockchain[] = ['ethereum', 'solana', 'bnb', 'polygon'];

function buildInitialTokens(): Token[] {
  return CHAINS.map((c) => {
    const m = CHAIN_META[c];
    return {
      id: c,
      name: m.name,
      symbol: m.symbol,
      balance: 0,
      balanceUSD: 0,
      change24h: 0,
      decimals: m.decimals,
      blockchain: c,
    };
  });
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isWalletCreated, setIsWalletCreated] = useState(false);
  const [pin, setPinState] = useState<string | null>(null);
  const [seedPhrase, setSeedPhrase] = useState<string[]>([]);
  const [selectedBlockchain, setSelectedBlockchain] = useState<Blockchain>('ethereum');
  const [network, setNetwork] = useState<Network>('mainnet');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [walletAddresses, setWalletAddresses] = useState<WalletAddresses | null>(null);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [prices, setPrices] = useState<Partial<Record<Blockchain, PriceInfo>>>({});
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [autoLockTimer, setAutoLockTimer] = useState(5);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const addressesRef = useRef<WalletAddresses | null>(null);

  useEffect(() => {
    addressesRef.current = walletAddresses;
  }, [walletAddresses]);

  const refreshBalances = useCallback(async () => {
    const addr = addressesRef.current;
    if (!addr) return;
    setIsLoadingBalances(true);
    try {
      const [pricesByChain, ...balances] = await Promise.all([
        getPrices(CHAINS),
        ...CHAINS.map((c) => getNativeBalance(c, addr[c]).catch(() => 0)),
      ]);
      setPrices(pricesByChain);
      setTokens((prev) => {
        const next = prev.length === CHAINS.length ? [...prev] : buildInitialTokens();
        CHAINS.forEach((c, i) => {
          const bal = balances[i] as number;
          const price = pricesByChain[c]?.usd ?? 0;
          const change = pricesByChain[c]?.change24h ?? 0;
          const slot = next.findIndex((t) => t.blockchain === c && !t.contractAddress);
          if (slot >= 0) {
            next[slot] = {
              ...next[slot],
              balance: bal,
              balanceUSD: bal * price,
              change24h: change,
            };
          }
        });
        return next;
      });
      setLastRefreshedAt(Date.now());
    } finally {
      setIsLoadingBalances(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const [storedPin, { addresses, created, mnemonic }, bio] = await Promise.all([
          getPin(),
          loadWalletFromStorage(),
          getBiometricEnabled(),
        ]);
        setPinState(storedPin);
        setBiometricEnabledState(bio);
        if (created && addresses) {
          setIsWalletCreated(true);
          setWalletAddresses(addresses);
          addressesRef.current = addresses;
          if (mnemonic) setSeedPhrase(mnemonic.split(' '));
          setTokens(buildInitialTokens());
          setIsLocked(true);
        }
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // Auto-refresh once the wallet is unlocked so the user sees real numbers
  // without having to pull down.
  useEffect(() => {
    if (!isWalletCreated || isLocked) return;
    refreshBalances();
  }, [isWalletCreated, isLocked, refreshBalances]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' && isWalletCreated && autoLockTimer > 0) {
        setIsLocked(true);
      }
    });
    return () => sub.remove();
  }, [isWalletCreated, autoLockTimer]);

  const setPin = useCallback(async (value: string) => {
    await savePin(value);
    setPinState(value);
  }, []);

  const setBiometricEnabled = useCallback(async (value: boolean) => {
    await saveBiometricEnabled(value);
    setBiometricEnabledState(value);
  }, []);

  const walletAddress = walletAddresses ? walletAddresses[selectedBlockchain] ?? '' : '';

  const initWallet = useCallback(async (mnemonic: string) => {
    const addresses = await deriveAddresses(mnemonic);
    setWalletAddresses(addresses);
    addressesRef.current = addresses;
    await saveWalletToStorage(addresses, mnemonic);
    setSeedPhrase(mnemonic.split(' '));
    setTokens(buildInitialTokens());
    setIsWalletCreated(true);
    setIsLocked(false);
  }, []);

  const addToken = useCallback((token: Token) => {
    setTokens((prev) => {
      if (prev.find((t) => t.id === token.id)) return prev;
      return [...prev, token];
    });
  }, []);

  const resetWallet = useCallback(async () => {
    await clearWalletFromStorage();
    setPinState(null);
    setSeedPhrase([]);
    setWalletAddresses(null);
    addressesRef.current = null;
    setTokens([]);
    setIsWalletCreated(false);
    setBiometricEnabledState(false);
    setIsLocked(false);
    setPrices({});
    setLastRefreshedAt(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        isWalletCreated,
        setIsWalletCreated,
        pin,
        setPin,
        seedPhrase,
        setSeedPhrase,
        selectedBlockchain,
        setSelectedBlockchain,
        network,
        setNetwork,
        tokens,
        addToken,
        walletAddress,
        walletAddresses,
        initWallet,
        isLoadingBalances,
        lastRefreshedAt,
        refreshBalances,
        prices,
        biometricEnabled,
        setBiometricEnabled,
        autoLockTimer,
        setAutoLockTimer,
        isLocked,
        setIsLocked,
        resetWallet,
        isLoading,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
