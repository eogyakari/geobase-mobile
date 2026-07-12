import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, SafeAreaView,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { supabase } from '../lib/supabase'

const GOLD  = '#c9a84c'
const DARK  = '#0a1209'
const MID   = '#152019'
const BORD  = '#1e3320'
const MUTED = '#8a9e8d'
const WHITE = '#e8e0d0'
const GREEN = '#4caf50'
const RED   = '#ef5350'

function fmt(n: number, currency = 'GHS') {
  return `${currency} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ProgressBar({ value, color = GOLD }: { value: number; color?: string }) {
  return (
    <View style={{ width: '100%', height: 8, backgroundColor: BORD, borderRadius: 99, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color, borderRadius: 99 }} />
    </View>
  )
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function AdminPettyCashScreen({ navigation }: any) {
  const [loading,   setLoading]   = useState(true)
  const [profile,   setProfile]   = useState<any>(null)
  const [txs,       setTxs]       = useState<any[]>([])
  const [threshold, setThreshold] = useState<any>(null)

  const [showSetThreshold, setShowSetThreshold] = useState(false)
  const [thresholdInput, setThresholdInput] = useState('')
  const [saving, setSaving] = useState(false)

  const now = new Date()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase
        .from('profiles').select('id, full_name, organization_id').eq('id', user.id).single()
      setProfile(prof)
      if (!prof?.organization_id) return

      const [t, th] = await Promise.all([
        supabase.from('petty_cash_transactions')
          .select('*, profile:profiles!profile_id(full_name)')
          .eq('organization_id', prof.organization_id)
          .eq('category', 'Administrative')
          .order('created_at', { ascending: false }),
        supabase.from('petty_cash_admin_thresholds')
          .select('*')
          .eq('organization_id', prof.organization_id)
          .eq('year', now.getFullYear())
          .eq('month', now.getMonth() + 1)
          .maybeSingle(),
      ])
      setTxs(t.data ?? [])
      setThreshold(th.data ?? null)
      setThresholdInput(th.data ? String(th.data.threshold_amount) : '')
    } finally {
      setLoading(false)
    }
  }

  const totalIn  = txs.filter(t => t.type === 'Top-up').reduce((s, t) => s + Number(t.amount || 0), 0)
  const totalOut = txs.filter(t => t.type === 'Disbursement').reduce((s, t) => s + Number(t.amount || 0), 0)
  const balance  = totalIn - totalOut

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const usedThisMonth = txs
    .filter(t => t.type === 'Disbursement' && new Date(t.created_at) >= monthStart)
    .reduce((s, t) => s + Number(t.amount || 0), 0)

  const thresholdAmt = threshold ? Number(threshold.threshold_amount) : 0
  const usagePct = thresholdAmt > 0 ? Math.round((usedThisMonth / thresholdAmt) * 100) : 0
  const usageColor = usagePct >= 100 ? RED : usagePct >= 80 ? GOLD : GREEN

  const submitThreshold = async () => {
    if (!thresholdInput || Number(thresholdInput) <= 0) {
      Alert.alert('Required', 'Enter a valid threshold amount')
      return
    }
    setSaving(true)
    try {
      if (threshold) {
        const { error } = await supabase
          .from('petty_cash_admin_thresholds')
          .update({ threshold_amount: Number(thresholdInput), breached_at: null })
          .eq('id', threshold.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('petty_cash_admin_thresholds').insert({
          organization_id: profile.organization_id,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          threshold_amount: Number(thresholdInput),
        })
        if (error) throw error
      }
      Alert.alert('Success', 'Threshold updated.')
      setShowSetThreshold(false)
      await load()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: GOLD, fontSize: 18 }}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerEyebrow}>GEOBASE · CEO</Text>
          <Text style={styles.headerTitle}>Administrative Petty Cash</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        <View style={[styles.card, { alignItems: 'center' }]}>
          <Text style={styles.cardSub}>Current Balance</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: balance <= 0 ? RED : GOLD, marginTop: 6 }}>{fmt(balance)}</Text>
        </View>

        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={styles.cardTitle}>{MONTH_NAMES[now.getMonth()]} {now.getFullYear()} Threshold</Text>
            {threshold?.breached_at && (
              <View style={{ backgroundColor: RED + '22', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ color: RED, fontSize: 10, fontWeight: '700' }}>BREACHED</Text>
              </View>
            )}
          </View>

          {threshold ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: MUTED, fontSize: 12 }}>Used: {fmt(usedThisMonth)}</Text>
                <Text style={{ color: usageColor, fontWeight: '700', fontSize: 13 }}>{usagePct}%</Text>
              </View>
              <ProgressBar value={usagePct} color={usageColor} />
              <Text style={{ color: MUTED, fontSize: 11, marginTop: 8 }}>Threshold: {fmt(thresholdAmt)}</Text>
            </>
          ) : (
            <Text style={styles.emptyText}>No threshold set for this month yet.</Text>
          )}

          <TouchableOpacity style={styles.setThresholdBtn} onPress={() => setShowSetThreshold(true)}>
            <Text style={styles.setThresholdBtnText}>{threshold ? 'Update Threshold' : 'Set Threshold'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Administrative Transactions</Text>
          {txs.length === 0 ? (
            <Text style={styles.emptyText}>No transactions yet.</Text>
          ) : txs.slice(0, 15).map((t, i) => (
            <View key={t.id} style={[styles.txRow, i === Math.min(14, txs.length - 1) && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: t.type === 'Top-up' ? GREEN : RED, fontWeight: '700', marginBottom: 3 }}>{t.type}</Text>
                {t.purpose && <Text style={styles.txPurpose}>{t.purpose}</Text>}
                <Text style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{t.profile?.full_name ?? '—'} · {new Date(t.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>
              </View>
              <Text style={[styles.txAmt, { color: t.type === 'Top-up' ? GREEN : RED }]}>
                {t.type === 'Top-up' ? '+' : '−'}{fmt(t.amount)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Set Threshold Modal */}
      <Modal visible={showSetThreshold} animationType="slide" transparent onRequestClose={() => setShowSetThreshold(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalSheet}>
              <Text style={styles.modalTitle}>{threshold ? 'Update' : 'Set'} Monthly Threshold</Text>
              <Text style={{ color: MUTED, fontSize: 12, marginBottom: 16 }}>{MONTH_NAMES[now.getMonth()]} {now.getFullYear()}</Text>
              <Text style={styles.label}>Threshold Amount (GHS) *</Text>
              <TextInput style={styles.input} value={thresholdInput} onChangeText={setThresholdInput} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#4a7a54" />
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowSetThreshold(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.6 }]} onPress={submitThreshold} disabled={saving}>
                  {saving ? <ActivityIndicator color={DARK} /> : <Text style={styles.submitBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: DARK },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORD },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: MID, borderWidth: 1, borderColor: BORD, alignItems: 'center', justifyContent: 'center' },
  headerEyebrow: { fontSize: 10, color: GOLD, letterSpacing: 1.5, marginBottom: 2 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: WHITE },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 14, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: WHITE },
  cardSub: { fontSize: 12, color: MUTED },
  emptyText: { fontSize: 13, color: MUTED, textAlign: 'center', paddingVertical: 12 },
  setThresholdBtn: { marginTop: 14, backgroundColor: GOLD + '18', borderWidth: 1, borderColor: GOLD + '55', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  setThresholdBtnText: { color: GOLD, fontWeight: '700', fontSize: 13 },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a2a1e', gap: 10 },
  txPurpose: { fontSize: 12, color: WHITE },
  txAmt: { fontSize: 13, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: MID, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: WHITE },
  label: { fontSize: 12, fontWeight: '600', color: GOLD, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: DARK, borderWidth: 1, borderColor: BORD, borderRadius: 10, padding: 12, fontSize: 14, color: WHITE, marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: BORD, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: MUTED, fontWeight: '600' },
  submitBtn: { flex: 1, backgroundColor: GOLD, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  submitBtnText: { color: DARK, fontWeight: '700', fontSize: 14 },
})