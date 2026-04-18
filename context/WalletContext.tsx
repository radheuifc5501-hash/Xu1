import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { CHAIN_META, Chain, getNativeBalance, Network } from '../mobile/services/chainService';
import { getPrices, PriceInfo } from '../mobile/services/priceService';

const NETWORK_STORAGE_KEY = 'xu_wallet_network';

export type Blockchain = Chain;
export type { Network };

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
  setNetwork: (value: Network) => Promise<void>;
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
  const [network, setNetworkState] = useState<Network>('mainnet');
  const networkRef = useRef<Network>('mainnet');
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
  // Monotonic request id for refreshBalances. Flipping the network fires a
  // new fetch via the auto-refresh effect; if the user toggles quickly the
  // earlier fetch could resolve after the later one and paint the wrong
  // network's balances. Every call bumps this counter; the handler only
  // commits when its captured id still matches.
  const refreshIdRef = useRef(0);

  useEffect(() => {
    addressesRef.current = walletAddresses;
  }, [walletAddresses]);

  useEffect(() => {
    networkRef.current = network;
  }, [network]);

  const refreshBalances = useCallback(async () => {
    const addr = addressesRef.current;
    if (!addr) return;
    const net = networkRef.current;
    const myReqId = ++refreshIdRef.current;
    setIsLoadingBalances(true);
    try {
      // CoinGecko only prices mainnet tokens, so testnet portfolio value is
      // intentionally $0. We still fetch balances, just skip the price call.
      const pricesPromise: Promise<Partial<Record<Chain, PriceInfo>>> =
        net === 'mainnet' ? getPrices(CHAINS) : Promise.resolve({});
      const [pricesByChain, ...balances] = await Promise.all([
        pricesPromise,
        ...CHAINS.map((c) => getNativeBalance(c, addr[c], net).catch(() => 0)),
      ]);
      // Discard if a newer refresh (e.g. after a network toggle) is already
      // in flight. Otherwise a slow mainnet fetch could overwrite the
      // testnet numbers we just painted.
      if (myReqId !== refreshIdRef.current) return;
      setPrices(pricesByChain);
      setTokens((prev) => {
        // Preserve any custom tokens the user has added via addToken. We
        // only rebuild the list from scratch when the array is somehow
        // shorter than the required native-chain baseline.
        const next = prev.length >= CHAINS.length ? [...prev] : buildInitialTokens();
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
      if (myReqId === refreshIdRef.current) setIsLoadingBalances(false);
    }
  }, []);

  const setNetwork = useCallback(async (value: Network) => {
    networkRef.current = value;
    setNetworkState(value);
    try {
      await AsyncStorage.setItem(NETWORK_STORAGE_KEY, value);
    } catch {
      // Non-fatal: if persistence fails we'll just default back to
      // mainnet next launch.
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const [storedPin, { addresses, created, mnemonic }, bio, storedNet] = await Promise.all([
          getPin(),
          loadWalletFromStorage(),
          getBiometricEnabled(),
          AsyncStorage.getItem(NETWORK_STORAGE_KEY),
        ]);
        setPinState(storedPin);
        setBiometricEnabledState(bio);
        if (storedNet === 'testnet' || storedNet === 'mainnet') {
          networkRef.current = storedNet;
          setNetworkState(storedNet);
        }
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

  // Auto-refresh once the wallet is unlocked (or when network changes) so
  // the user sees real numbers without having to pull down.
  useEffect(() => {
    if (!isWalletCreated || isLocked) return;
    refreshBalances();
  }, [isWalletCreated, isLocked, network, refreshBalances]);

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
    // Each stage is tagged so the Alert on set-pin can show exactly which
    // step failed (address derivation vs. secure-storage vs. state update).
    let addresses: WalletAddresses;
    try {
      addresses = await deriveAddresses(mnemonic);
    } catch (err) {
      (err as { __xuStage?: string }).__xuStage = 'deriveAddresses';
      throw err;
    }
    try {
      await saveWalletToStorage(addresses, mnemonic);
    } catch (err) {
      (err as { __xuStage?: string }).__xuStage = 'saveWalletToStorage';
      throw err;
    }
    setWalletAddresses(addresses);
    addressesRef.current = addresses;
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
    // Clear the persisted network choice too, so a fresh wallet on the
    // same device always starts on mainnet instead of silently inheriting
    // the previous user's testnet setting.
    try {
      await AsyncStorage.removeItem(NETWORK_STORAGE_KEY);
    } catch {
      // Non-fatal: worst case the user sees a testnet pill on first
      // launch and flips it back manually.
    }
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
    networkRef.current = 'mainnet';
    setNetworkState('mainnet');
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
