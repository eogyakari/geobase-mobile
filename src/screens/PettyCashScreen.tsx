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

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: color + '22', borderWidth: 1, borderColor: color + '44' }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color }}>{label}</Text>
    </View>
  )
}

export default function PettyCashScreen({ navigation }: any) {
  const [loading,   setLoading]   = useState(true)
  const [profile,   setProfile]   = useState<any>(null)
  const [projects,  setProjects]  = useState<any[]>([])
  const [txs,       setTxs]       = useState<any[]>([])
  const [orgProfiles, setOrgProfiles] = useState<any[]>([])
  const [threshold, setThreshold] = useState<any>(null)

  const [showTopUp,  setShowTopUp]  = useState(false)
  const [showDisburse, setShowDisburse] = useState(false)
  const [saving, setSaving] = useState(false)

  const [category, setCategory] = useState<'Project' | 'Administrative'>('Project')
  const [projectId, setProjectId] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [purpose, setPurpose] = useState('')
  const [receiver, setReceiver] = useState('')
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [showReceiverPicker, setShowReceiverPicker] = useState(false)

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

      const now = new Date()
      const [p, t, op, th] = await Promise.all([
        supabase.from('projects').select('id, name').eq('organization_id', prof.organization_id).order('name'),
        supabase.from('petty_cash_transactions')
          .select('*, project:projects!project_id(name), profile:profiles!profile_id(full_name)')
          .eq('organization_id', prof.organization_id)
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('id, full_name').eq('organization_id', prof.organization_id).order('full_name'),
        supabase.from('petty_cash_admin_thresholds')
          .select('id, threshold_amount')
          .eq('organization_id', prof.organization_id)
          .eq('year', now.getFullYear())
          .eq('month', now.getMonth() + 1)
          .maybeSingle(),
      ])
      setProjects(p.data ?? [])
      setTxs(t.data ?? [])
      setOrgProfiles(op.data ?? [])
      setThreshold(th.data ?? null)
    } finally {
      setLoading(false)
    }
  }

  const balances: Record<string, number> = projects.reduce((acc: any, p) => {
    const projTxs = txs.filter(t => t.project_id === p.id)
    const in_ = projTxs.filter(t => t.type === 'Top-up').reduce((s, t) => s + Number(t.amount || 0), 0)
    const out = projTxs.filter(t => t.type === 'Disbursement').reduce((s, t) => s + Number(t.amount || 0), 0)
    acc[p.id] = in_ - out
    return acc
  }, {})

  const adminTxs = txs.filter(t => t.category === 'Administrative')
  const adminIn  = adminTxs.filter(t => t.type === 'Top-up').reduce((s, t) => s + Number(t.amount || 0), 0)
  const adminOut = adminTxs.filter(t => t.type === 'Disbursement').reduce((s, t) => s + Number(t.amount || 0), 0)
  const adminBalance = adminIn - adminOut
  const totalBalance = Object.values(balances).reduce((s: number, v: any) => s + v, 0) + adminBalance

  const resetForm = () => {
    setCategory('Project'); setProjectId(''); setAmount(''); setReference(''); setNotes(''); setPurpose(''); setReceiver('')
  }

  const submitTopUp = async () => {
    if (category === 'Project' && !projectId) return Alert.alert('Required', 'Select a project')
    if (!amount || Number(amount) <= 0) return Alert.alert('Required', 'Enter a valid amount')
    setSaving(true)
    try {
      const { error } = await supabase.from('petty_cash_transactions').insert([{
        organization_id: profile.organization_id,
        project_id: category === 'Project' ? projectId : null,
        category, type: 'Top-up',
        amount: Number(amount),
        reference: reference || null,
        notes: notes || null,
        profile_id: profile.id,
      }])
      if (error) throw error
      Alert.alert('Success', 'Top-up recorded.')
      setShowTopUp(false); resetForm(); await load()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setSaving(false)
    }
  }

  const submitDisbursement = async () => {
    if (category === 'Project' && !projectId) return Alert.alert('Required', 'Select a project')
    if (!amount || Number(amount) <= 0) return Alert.alert('Required', 'Enter a valid amount')
    if (!purpose.trim()) return Alert.alert('Required', 'Enter a purpose')
    if (!receiver.trim()) return Alert.alert('Required', 'Select a receiver')

    const amt = Number(amount)

    if (category === 'Project') {
      const bal = balances[projectId] ?? 0
      if (amt > bal) return Alert.alert('Insufficient Balance', `Available: ${fmt(bal)}. Top up before disbursing.`)
    } else {
      if (amt > adminBalance) return Alert.alert('Insufficient Balance', `Available: ${fmt(adminBalance)}.`)
      if (!threshold) return Alert.alert('No Threshold Set', 'Ask the CEO to set an Administrative petty cash threshold for this month.')

      const now = new Date()
      const { data: monthTxs } = await supabase
        .from('petty_cash_transactions')
        .select('amount')
        .eq('organization_id', profile.organization_id)
        .eq('category', 'Administrative')
        .eq('type', 'Disbursement')
        .gte('created_at', new Date(now.getFullYear(), now.getMonth(), 1).toISOString())

      const usedThisMonth = (monthTxs ?? []).reduce((s, t) => s + Number(t.amount || 0), 0)
      if (usedThisMonth + amt > Number(threshold.threshold_amount)) {
        await supabase.from('petty_cash_admin_thresholds').update({ breached_at: new Date().toISOString() }).eq('id', threshold.id)
        return Alert.alert('Threshold Exceeded', `This would exceed this month's Administrative threshold (${fmt(threshold.threshold_amount)}).`)
      }
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('petty_cash_transactions').insert([{
        organization_id: profile.organization_id,
        project_id: category === 'Project' ? projectId : null,
        category, type: 'Disbursement',
        amount: amt, purpose, receiver,
        reference: reference || null,
        notes: notes || null,
        profile_id: profile.id,
      }])
      if (error) throw error
      Alert.alert('Success', 'Disbursement recorded.')
      setShowDisburse(false); resetForm(); await load()
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
          <Text style={styles.headerEyebrow}>GEOBASE · ACCOUNTS</Text>
          <Text style={styles.headerTitle}>Petty Cash</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        <View style={[styles.card, { alignItems: 'center' }]}>
          <Text style={styles.cardSub}>Total Petty Cash Balance</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: GOLD, marginTop: 6 }}>{fmt(totalBalance)}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: GOLD + '18', borderColor: GOLD + '55' }]} onPress={() => { resetForm(); setShowTopUp(true) }}>
            <Text style={{ color: GOLD, fontWeight: '700' }}>↑ Top Up</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: RED, borderColor: RED }]} onPress={() => { resetForm(); setShowDisburse(true) }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>↓ Disburse</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Balances by Project</Text>
          {projects.length === 0 ? (
            <Text style={styles.emptyText}>No projects.</Text>
          ) : projects.map(p => {
            const bal = balances[p.id] ?? 0
            return (
              <View key={p.id} style={styles.balRow}>
                <Text style={styles.balName}>{p.name}</Text>
                <Text style={[styles.balAmt, { color: bal <= 0 ? RED : GREEN }]}>{fmt(bal)}</Text>
              </View>
            )
          })}
          <View style={[styles.balRow, { borderTopWidth: 1, borderTopColor: BORD, marginTop: 4, paddingTop: 10 }]}>
            <Text style={[styles.balName, { fontWeight: '700' }]}>Administrative</Text>
            <Text style={[styles.balAmt, { color: adminBalance <= 0 ? RED : GREEN }]}>{fmt(adminBalance)}</Text>
          </View>
          {threshold && (
            <Text style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
              Monthly Administrative threshold: {fmt(threshold.threshold_amount)}
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Transactions</Text>
          {txs.length === 0 ? (
            <Text style={styles.emptyText}>No transactions yet.</Text>
          ) : txs.slice(0, 15).map((t, i) => (
            <View key={t.id} style={[styles.txRow, i === Math.min(14, txs.length - 1) && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <Badge label={t.type} color={t.type === 'Top-up' ? GREEN : RED} />
                  <Text style={{ fontSize: 11, color: MUTED }}>{t.category === 'Project' ? t.project?.name ?? '—' : 'Administrative'}</Text>
                </View>
                {t.purpose && <Text style={styles.txPurpose}>{t.purpose}</Text>}
              </View>
              <Text style={[styles.txAmt, { color: t.type === 'Top-up' ? GREEN : RED }]}>
                {t.type === 'Top-up' ? '+' : '−'}{fmt(t.amount)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Top Up Modal */}
      <Modal visible={showTopUp} animationType="slide" transparent onRequestClose={() => setShowTopUp(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView style={styles.modalSheet} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Petty Cash Top-Up</Text>

              <CategoryToggle category={category} setCategory={setCategory} />
              {category === 'Project' && (
                <ProjectField projectId={projectId} projects={projects} onPress={() => setShowProjectPicker(true)} />
              )}
              <Text style={styles.label}>Amount (GHS) *</Text>
              <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#4a7a54" />
              <Text style={styles.label}>Reference</Text>
              <TextInput style={styles.input} value={reference} onChangeText={setReference} placeholder="e.g. Withdrawal slip no." placeholderTextColor="#4a7a54" />
              <Text style={styles.label}>Notes</Text>
              <TextInput style={[styles.input, styles.textarea]} value={notes} onChangeText={setNotes} multiline placeholder="Optional notes..." placeholderTextColor="#4a7a54" />

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTopUp(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.6 }]} onPress={submitTopUp} disabled={saving}>
                  {saving ? <ActivityIndicator color={DARK} /> : <Text style={styles.submitBtnText}>Confirm Top-Up</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Disbursement Modal */}
      <Modal visible={showDisburse} animationType="slide" transparent onRequestClose={() => setShowDisburse(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView style={styles.modalSheet} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Petty Cash Disbursement</Text>

              <CategoryToggle category={category} setCategory={setCategory} />
              {category === 'Project' && (
                <ProjectField projectId={projectId} projects={projects} onPress={() => setShowProjectPicker(true)} />
              )}
              <Text style={styles.label}>Amount (GHS) *</Text>
              <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0.00" placeholderTextColor="#4a7a54" />
              <Text style={styles.label}>Purpose *</Text>
              <TextInput style={styles.input} value={purpose} onChangeText={setPurpose} placeholder="e.g. Site transport" placeholderTextColor="#4a7a54" />
              <Text style={styles.label}>Receiver *</Text>
              <TouchableOpacity style={styles.pickerField} onPress={() => setShowReceiverPicker(true)}>
                <Text style={{ color: receiver ? WHITE : '#4a7a54' }}>{receiver || 'Select receiver...'}</Text>
              </TouchableOpacity>
              <Text style={styles.label}>Reference</Text>
              <TextInput style={styles.input} value={reference} onChangeText={setReference} placeholder="e.g. Receipt no." placeholderTextColor="#4a7a54" />
              <Text style={styles.label}>Notes</Text>
              <TextInput style={[styles.input, styles.textarea]} value={notes} onChangeText={setNotes} multiline placeholder="Optional notes..." placeholderTextColor="#4a7a54" />

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowDisburse(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, { backgroundColor: RED }, saving && { opacity: 0.6 }]} onPress={submitDisbursement} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <Text style={[styles.submitBtnText, { color: '#fff' }]}>Confirm Disbursement</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Project picker */}
      <Modal visible={showProjectPicker} animationType="slide" transparent onRequestClose={() => setShowProjectPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowProjectPicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.modalTitle}>Select Project</Text>
            <ScrollView>
              {projects.map(p => (
                <TouchableOpacity key={p.id} style={styles.pickerRow} onPress={() => { setProjectId(p.id); setShowProjectPicker(false) }}>
                  <Text style={[styles.pickerRowText, p.id === projectId && { color: GOLD, fontWeight: '700' }]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Receiver picker */}
      <Modal visible={showReceiverPicker} animationType="slide" transparent onRequestClose={() => setShowReceiverPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowReceiverPicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.modalTitle}>Select Receiver</Text>
            <ScrollView>
              {orgProfiles.map(p => (
                <TouchableOpacity key={p.id} style={styles.pickerRow} onPress={() => { setReceiver(p.full_name); setShowReceiverPicker(false) }}>
                  <Text style={[styles.pickerRowText, p.full_name === receiver && { color: GOLD, fontWeight: '700' }]}>{p.full_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

function CategoryToggle({ category, setCategory }: { category: string; setCategory: (c: any) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
      {(['Project', 'Administrative'] as const).map(c => (
        <TouchableOpacity
          key={c}
          style={[styles.modeBtn, category === c && styles.modeBtnActive]}
          onPress={() => setCategory(c)}
        >
          <Text style={[styles.modeBtnText, category === c && styles.modeBtnTextActive]}>{c}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

function ProjectField({ projectId, projects, onPress }: { projectId: string; projects: any[]; onPress: () => void }) {
  const p = projects.find(pr => pr.id === projectId)
  return (
    <>
      <Text style={styles.label}>Project *</Text>
      <TouchableOpacity style={styles.pickerField} onPress={onPress}>
        <Text style={{ color: p ? WHITE : '#4a7a54' }}>{p?.name ?? 'Select project...'}</Text>
      </TouchableOpacity>
    </>
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
  cardTitle: { fontSize: 14, fontWeight: '700', color: WHITE, marginBottom: 10 },
  cardSub: { fontSize: 12, color: MUTED },
  emptyText: { fontSize: 13, color: MUTED, textAlign: 'center', paddingVertical: 16 },
  actionBtn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  balRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  balName: { fontSize: 13, color: WHITE, flex: 1 },
  balAmt: { fontSize: 14, fontWeight: '700' },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a2a1e', gap: 10 },
  txPurpose: { fontSize: 12, color: MUTED },
  txAmt: { fontSize: 13, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: MID, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '88%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: WHITE, marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '600', color: GOLD, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: DARK, borderWidth: 1, borderColor: BORD, borderRadius: 10, padding: 12, fontSize: 14, color: WHITE, marginBottom: 8 },
  textarea: { height: 80, textAlignVertical: 'top' },
  pickerField: { backgroundColor: DARK, borderWidth: 1, borderColor: BORD, borderRadius: 10, padding: 13, marginBottom: 8 },
  modeBtn: { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: BORD, alignItems: 'center' },
  modeBtnActive: { backgroundColor: GOLD, borderColor: GOLD },
  modeBtnText: { color: MUTED, fontWeight: '700', fontSize: 13 },
  modeBtnTextActive: { color: DARK },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 24 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: BORD, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: MUTED, fontWeight: '600' },
  submitBtn: { flex: 1, backgroundColor: GOLD, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  submitBtnText: { color: DARK, fontWeight: '700', fontSize: 14 },
  pickerSheet: { backgroundColor: MID, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  pickerRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#1a2a1e' },
  pickerRowText: { fontSize: 14, color: WHITE },
})