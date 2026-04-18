import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useWallet, Blockchain } from '../../context/WalletContext';
import { CHAIN_META, getNetworkMeta } from '../../mobile/services/chainService';

const CHAIN_COLORS: Record<Blockchain, string> = {
  ethereum: '#627EEA',
  solana: '#9945FF',
  bnb: '#F3BA2F',
  polygon: '#8247E5',
};

const CHAIN_ICONS: Record<Blockchain, string> = {
  ethereum: 'logo-ethereum',
  solana: 'planet-outline',
  bnb: 'logo-bitcoin',
  polygon: 'triangle-outline',
};

const CHAINS: Blockchain[] = ['ethereum', 'solana', 'bnb', 'polygon'];

function formatUsd(n: number): string {
  if (!isFinite(n)) return '$0.00';
  if (Math.abs(n) >= 1000) {
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return '$' + n.toFixed(2);
}

function formatBalance(n: number): string {
  if (n === 0) return '0';
  if (n < 0.0001) return n.toExponential(2);
  if (n < 1) return n.toFixed(6);
  if (n < 1000) return n.toFixed(4);
  return n.toFixed(2);
}

export default function Home() {
  const router = useRouter();
  const {
    selectedBlockchain,
    setSelectedBlockchain,
    tokens,
    isLoadingBalances,
    refreshBalances,
    walletAddress,
    lastRefreshedAt,
    network,
  } = useWallet();

  const isTestnet = network === 'testnet';
  const networkLabel = getNetworkMeta(selectedBlockchain, network).label;

  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const totalUSD = tokens.reduce((s, t) => s + (t.balanceUSD || 0), 0);
  // Weighted 24h change across the portfolio (only non-zero positions).
  const weighted = tokens.reduce(
    (acc, t) => {
      if (!t.balanceUSD) return acc;
      return {
        weight: acc.weight + t.balanceUSD,
        sum: acc.sum + t.balanceUSD * (t.change24h || 0),
      };
    },
    { weight: 0, sum: 0 }
  );
  const totalChange24h = weighted.weight > 0 ? weighted.sum / weighted.weight : 0;

  const handleCopy = async () => {
    if (!walletAddress) return;
    await Clipboard.setStringAsync(walletAddress);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshBalances();
    } finally {
      setRefreshing(false);
    }
  }, [refreshBalances]);

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}`
    : '';

  const visibleTokens = tokens.filter((t) => t.blockchain === selectedBlockchain);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6C4CF1"
          />
        }
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>XU Wallet</Text>
            <TouchableOpacity
              style={[
                styles.networkPill,
                isTestnet && styles.networkPillTestnet,
              ]}
              onPress={() => router.push('/(tabs)/settings')}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.networkDot,
                  { backgroundColor: isTestnet ? '#F59E0B' : '#10B981' },
                ]}
              />
              <Text
                style={[
                  styles.networkPillText,
                  isTestnet && { color: '#FCD34D' },
                ]}
              >
                {isTestnet ? `Testnet · ${networkLabel}` : 'Mainnet'}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => router.push({ pathname: '/history', params: { chain: selectedBlockchain } })}
          >
            <Ionicons name="time-outline" size={18} color="#9B97B2" />
          </TouchableOpacity>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Portfolio</Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceAmount}>{formatUsd(totalUSD)}</Text>
            {isLoadingBalances ? (
              <ActivityIndicator size="small" color="#6C4CF1" />
            ) : null}
          </View>
          {weighted.weight > 0 ? (
            <View style={styles.changeRow}>
              <Ionicons
                name={totalChange24h >= 0 ? 'trending-up' : 'trending-down'}
                size={14}
                color={totalChange24h >= 0 ? '#10B981' : '#FF6B6B'}
              />
              <Text
                style={[
                  styles.changeText,
                  { color: totalChange24h >= 0 ? '#10B981' : '#FF6B6B' },
                ]}
              >
                {totalChange24h >= 0 ? '+' : ''}
                {totalChange24h.toFixed(2)}% · 24h
              </Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.addressRow} onPress={handleCopy}>
            <Ionicons name="wallet-outline" size={14} color="#9B97B2" />
            <Text style={styles.address}>{shortAddr || '—'}</Text>
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={14}
              color={copied ? '#10B981' : '#9B97B2'}
            />
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push('/send')}
              activeOpacity={0.8}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </View>
              <Text style={styles.actionLabel}>Send</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push('/receive')}
              activeOpacity={0.8}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="arrow-down" size={20} color="#fff" />
              </View>
              <Text style={styles.actionLabel}>Receive</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push({ pathname: '/history', params: { chain: selectedBlockchain } })}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#24223A' }]}>
                <Ionicons name="time-outline" size={20} color="#6C4CF1" />
              </View>
              <Text style={styles.actionLabel}>History</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chainTabs}
        >
          {CHAINS.map((chain) => (
            <TouchableOpacity
              key={chain}
              style={[
                styles.chainTab,
                selectedBlockchain === chain && styles.chainTabActive,
              ]}
              onPress={() => setSelectedBlockchain(chain)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chainTabText,
                  selectedBlockchain === chain && { color: '#FFFFFF' },
                ]}
              >
                {CHAIN_META[chain].symbol}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Assets</Text>
          {lastRefreshedAt ? (
            <Text style={styles.sectionHint}>
              Updated {new Date(lastRefreshedAt).toLocaleTimeString()}
            </Text>
          ) : null}
        </View>

        {visibleTokens.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={40} color="#4A4760" />
            <Text style={styles.emptyText}>No tokens yet</Text>
          </View>
        ) : (
          visibleTokens.map((token) => (
            <TouchableOpacity
              key={token.id}
              style={styles.tokenCard}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.tokenIcon,
                  { backgroundColor: CHAIN_COLORS[token.blockchain] + '22' },
                ]}
              >
                <Ionicons
                  name={(CHAIN_ICONS[token.blockchain] as any) || 'ellipse-outline'}
                  size={22}
                  color={CHAIN_COLORS[token.blockchain]}
                />
              </View>
              <View style={styles.tokenInfo}>
                <Text style={styles.tokenName}>{token.name}</Text>
                <View style={styles.tokenSubRow}>
                  <Text style={styles.tokenSymbol}>{token.symbol}</Text>
                  {token.change24h !== 0 ? (
                    <Text
                      style={[
                        styles.tokenChange,
                        {
                          color:
                            token.change24h >= 0 ? '#10B981' : '#FF6B6B',
                        },
                      ]}
                    >
                      {token.change24h >= 0 ? '+' : ''}
                      {token.change24h.toFixed(2)}%
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.tokenBalance}>
                <Text style={styles.tokenAmount}>
                  {formatBalance(token.balance)} {token.symbol}
                </Text>
                <Text style={styles.tokenUSD}>
                  {formatUsd(token.balanceUSD)}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0E17' },
  scroll: { padding: 20, paddingBottom: 32 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  networkPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#1A1825',
    borderWidth: 1,
    borderColor: '#24223A',
  },
  networkPillTestnet: {
    backgroundColor: '#3B2A0E',
    borderColor: '#F59E0B55',
  },
  networkDot: { width: 6, height: 6, borderRadius: 3 },
  networkPillText: { color: '#9B97B2', fontSize: 11, fontWeight: '700' },
  historyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1825',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceCard: {
    backgroundColor: '#1A1825',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#6C4CF122',
  },
  balanceLabel: { color: '#9B97B2', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  balanceAmount: { fontSize: 36, fontWeight: '900', color: '#FFFFFF' },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  changeText: { fontSize: 13, fontWeight: '700' },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#24223A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  address: { color: '#9B97B2', fontSize: 13, fontFamily: 'monospace' },
  actionRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, alignItems: 'center', gap: 6 },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#6C4CF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { color: '#9B97B2', fontSize: 13, fontWeight: '600' },
  chainTabs: { gap: 8, paddingHorizontal: 0, marginBottom: 16 },
  chainTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1825',
    borderWidth: 1,
    borderColor: '#24223A',
  },
  chainTabActive: { backgroundColor: '#6C4CF1', borderColor: '#6C4CF1' },
  chainTabText: { color: '#9B97B2', fontSize: 13, fontWeight: '700' },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  sectionHint: { color: '#4A4760', fontSize: 11 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: '#4A4760', fontSize: 15 },
  tokenCard: {
    backgroundColor: '#1A1825',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  tokenIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tokenInfo: { flex: 1 },
  tokenName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  tokenSubRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  tokenSymbol: { color: '#9B97B2', fontSize: 13 },
  tokenChange: { fontSize: 12, fontWeight: '700' },
  tokenBalance: { alignItems: 'flex-end' },
  tokenAmount: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  tokenUSD: { color: '#9B97B2', fontSize: 12, marginTop: 2 },
});
