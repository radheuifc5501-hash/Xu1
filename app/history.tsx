import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useWallet, Blockchain } from '../context/WalletContext';
import { CHAIN_META, Chain, getHistory, TxRow } from '../mobile/services/chainService';

const CHAINS: Chain[] = ['ethereum', 'solana', 'bnb', 'polygon'];

function relTime(ts: number): string {
  if (!ts) return '—';
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function History() {
  const router = useRouter();
  const params = useLocalSearchParams<{ chain?: string }>();
  const { walletAddresses, selectedBlockchain } = useWallet();
  const initialChain =
    (params.chain as Blockchain) &&
    CHAINS.includes(params.chain as Chain)
      ? (params.chain as Chain)
      : (selectedBlockchain as Chain);
  const [chain, setChain] = useState<Chain>(initialChain);
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!walletAddresses) return;
      if (!opts?.silent) setLoading(true);
      try {
        const out = await getHistory(chain, walletAddresses[chain]);
        setRows(out);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [chain, walletAddresses]
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load({ silent: true });
  }, [load]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chainTabs}
      >
        {CHAINS.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.chainTab, chain === c && styles.chainTabActive]}
            onPress={() => setChain(c)}
          >
            <Text
              style={[
                styles.chainTabText,
                chain === c && { color: '#FFFFFF' },
              ]}
            >
              {CHAIN_META[c].symbol}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && rows.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color="#6C4CF1" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#6C4CF1"
            />
          }
        >
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={40} color="#4A4760" />
              <Text style={styles.emptyText}>No transactions yet</Text>
              <Text style={styles.emptyHint}>
                Explorer data may be unavailable for {CHAIN_META[chain].symbol} without an API key.
              </Text>
            </View>
          ) : (
            rows.map((t) => (
              <TouchableOpacity
                key={t.hash}
                style={styles.row}
                onPress={() => Linking.openURL(t.explorerUrl)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.rowIcon,
                    {
                      backgroundColor:
                        t.direction === 'out'
                          ? '#4B1F2A'
                          : t.direction === 'in'
                            ? '#0E3A2B'
                            : '#24223A',
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      t.direction === 'out'
                        ? 'arrow-up'
                        : t.direction === 'in'
                          ? 'arrow-down'
                          : 'swap-horizontal'
                    }
                    size={18}
                    color={
                      t.direction === 'out'
                        ? '#FF6B6B'
                        : t.direction === 'in'
                          ? '#10B981'
                          : '#9B97B2'
                    }
                  />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>
                    {t.direction === 'out'
                      ? 'Sent'
                      : t.direction === 'in'
                        ? 'Received'
                        : 'Transfer'}
                  </Text>
                  <Text style={styles.rowSub}>{relTime(t.timestamp)}</Text>
                </View>
                <View style={styles.rowValue}>
                  <Text
                    style={[
                      styles.rowAmount,
                      {
                        color:
                          t.direction === 'out'
                            ? '#FF9B9B'
                            : t.direction === 'in'
                              ? '#10B981'
                              : '#FFFFFF',
                      },
                    ]}
                  >
                    {t.value ? t.value.toFixed(6) : '—'} {t.symbol}
                  </Text>
                  <Text style={styles.rowStatus}>
                    {t.status === 'success' ? 'Confirmed' : t.status}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0E17' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1825',
  },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  chainTabs: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
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
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyText: { color: '#9B97B2', fontSize: 15, fontWeight: '600' },
  emptyHint: {
    color: '#4A4760',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1825',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowInfo: { flex: 1 },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rowSub: { color: '#9B97B2', fontSize: 12, marginTop: 2 },
  rowValue: { alignItems: 'flex-end' },
  rowAmount: { fontSize: 14, fontWeight: '700' },
  rowStatus: { color: '#9B97B2', fontSize: 11, marginTop: 2 },
});
