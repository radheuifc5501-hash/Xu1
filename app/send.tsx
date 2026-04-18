import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useWallet, Blockchain } from '../context/WalletContext';
import { getMnemonic } from '../mobile/services/walletService';
import {
  CHAIN_META,
  Chain,
  isValidRecipient,
  sendEvmNative,
  sendSolanaNative,
  getNetworkMeta,
} from '../mobile/services/chainService';

const CHAINS: Chain[] = ['ethereum', 'solana', 'bnb', 'polygon'];

type SendState =
  | { phase: 'idle' }
  | { phase: 'sending' }
  | { phase: 'sent'; hash: string; chain: Chain }
  | { phase: 'error'; message: string };

export default function Send() {
  const router = useRouter();
  const { selectedBlockchain, walletAddresses, refreshBalances, network } = useWallet();
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<Blockchain>(selectedBlockchain);
  const [state, setState] = useState<SendState>({ phase: 'idle' });

  const sending = state.phase === 'sending';

  const performSend = async () => {
    setState({ phase: 'sending' });
    try {
      const mnemonic = await getMnemonic();
      if (!mnemonic) throw new Error('Wallet seed not found on device');
      let hash: string;
      if (selectedToken === 'solana') {
        hash = await sendSolanaNative(mnemonic, toAddress.trim(), amount, network);
      } else {
        hash = await sendEvmNative(selectedToken, mnemonic, toAddress.trim(), amount, network);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState({ phase: 'sent', hash, chain: selectedToken });
      refreshBalances();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setState({
        phase: 'error',
        message: typeof e?.message === 'string' ? e.message : 'Transaction failed',
      });
    }
  };

  const handleSend = () => {
    const trimmed = toAddress.trim();
    if (!trimmed) {
      Alert.alert('Missing Address', 'Please enter the recipient address.');
      return;
    }
    if (!isValidRecipient(selectedToken, trimmed)) {
      Alert.alert(
        'Invalid Address',
        `"${trimmed.slice(0, 16)}…" is not a valid ${CHAIN_META[selectedToken].symbol} address.`
      );
      return;
    }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    const netLabel = getNetworkMeta(selectedToken, network).label;
    Alert.alert(
      'Confirm Transaction',
      `Send ${amount} ${CHAIN_META[selectedToken].symbol} (${netLabel}) to\n${trimmed.slice(0, 16)}…${trimmed.slice(-8)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: performSend },
      ]
    );
  };

  if (state.phase === 'sent') {
    const explorer = getNetworkMeta(state.chain, network).explorerTx(state.hash);
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successBox}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>
          <Text style={styles.successTitle}>Transaction sent</Text>
          <Text style={styles.successHash} selectable>
            {state.hash}
          </Text>
          <TouchableOpacity
            style={styles.explorerBtn}
            onPress={() => Linking.openURL(explorer)}
          >
            <Ionicons name="open-outline" size={16} color="#6C4CF1" />
            <Text style={styles.explorerText}>View in explorer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => router.back()} disabled={sending}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sectionLabel}>Asset</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 20 }}
          >
            {CHAINS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.tokenChip,
                  selectedToken === c && styles.tokenChipActive,
                ]}
                onPress={() => setSelectedToken(c)}
                disabled={sending}
              >
                <Text
                  style={[
                    styles.tokenChipText,
                    selectedToken === c && { color: '#FFFFFF' },
                  ]}
                >
                  {CHAIN_META[c].symbol}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.sectionLabel}>Recipient Address</Text>
          <View style={styles.inputCard}>
            <TextInput
              style={styles.input}
              value={toAddress}
              onChangeText={setToAddress}
              placeholder={selectedToken === 'solana' ? 'Base58 address' : '0x…'}
              placeholderTextColor="#4A4760"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!sending}
            />
          </View>

          <Text style={styles.sectionLabel}>Amount</Text>
          <View style={styles.amountRow}>
            <View style={[styles.inputCard, { flex: 1 }]}>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor="#4A4760"
                keyboardType="decimal-pad"
                editable={!sending}
              />
            </View>
            <View style={styles.symbolBadge}>
              <Text style={styles.symbolText}>{CHAIN_META[selectedToken].symbol}</Text>
            </View>
          </View>

          <View style={styles.fromRow}>
            <Ionicons name="wallet-outline" size={14} color="#9B97B2" />
            <Text style={styles.fromText}>
              From:{' '}
              {walletAddresses
                ? `${walletAddresses[selectedToken]?.slice(0, 10)}…`
                : '—'}
            </Text>
          </View>

          {state.phase === 'error' ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#FF6B6B" />
              <Text style={styles.errorText}>{state.message}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.sendBtn, sending && { opacity: 0.6 }]}
            onPress={handleSend}
            activeOpacity={0.85}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="arrow-up" size={20} color="#fff" />
            )}
            <Text style={styles.sendBtnText}>
              {sending ? 'Broadcasting…' : 'Send'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  scroll: { padding: 20, paddingBottom: 20 },
  sectionLabel: {
    color: '#9B97B2',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  tokenChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1825',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#24223A',
  },
  tokenChipActive: { backgroundColor: '#6C4CF1', borderColor: '#6C4CF1' },
  tokenChipText: { color: '#9B97B2', fontSize: 13, fontWeight: '700' },
  inputCard: {
    backgroundColor: '#1A1825',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#24223A',
    marginBottom: 16,
  },
  input: { color: '#FFFFFF', fontSize: 15, padding: 14 },
  amountRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 16 },
  symbolBadge: {
    backgroundColor: '#1A1825',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#24223A',
  },
  symbolText: { color: '#9B97B2', fontSize: 14, fontWeight: '700' },
  fromRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  fromText: { color: '#9B97B2', fontSize: 13 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4B1F2A',
    borderColor: '#FF6B6B33',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  errorText: { color: '#FFB3B3', fontSize: 13, flex: 1 },
  footer: {
    padding: 20,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#1A1825',
  },
  sendBtn: {
    backgroundColor: '#6C4CF1',
    borderRadius: 16,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  successBox: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  successHash: {
    color: '#9B97B2',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  explorerBtn: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#1A1825',
    borderRadius: 12,
    marginTop: 8,
  },
  explorerText: { color: '#6C4CF1', fontSize: 14, fontWeight: '700' },
  doneBtn: {
    marginTop: 12,
    backgroundColor: '#6C4CF1',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 14,
  },
  doneText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
