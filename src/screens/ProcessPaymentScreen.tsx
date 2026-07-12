import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, SafeAreaView,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform, FlatList,
} from 'react-native'
import { supabase } from '../lib/supabase'

const GOLD  = '#c9a84c'
const DARK  = '#0a1209'
const MID   = '#152019'
const BORD  = '#1e3320'
const MUTED = '#8a9e8d'
const WHITE = '#e8e0d0'
const GREEN = '#4caf50'

function fmt(n: number, currency = 'GHS') {
  return `${currency} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const PAYMENT_METHODS = ['Bank Transfer', 'Mobile Money', 'Cash', 'Cheque']

export default function ProcessPaymentScreen({ navigation }: any) {
  const [loading,  setLoading]  = useState(true)
  const [profile,  setProfile]  = useState<any>(null)
  const [queue,    setQueue]    = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [processing, setProcessing] = useState(false)

  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer')
  const [paymentReference, setPaymentReference] = useState('')
  const [invoiceRef, setInvoiceRef] = useState('')
  const [showMethodPicker, setShowMethodPicker] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase
        .from('profiles').select('id, full_name, organization_id').eq('id', user.id).single()
      setProfile(prof)

      const { data } = await supabase.from('payment_requests').select(`
        *, project:projects!project_id(name, currency),
        sub_contractor:sub_contractors!sub_contractor_id(name, trade, phone, contract_sum),
        requester:profiles!requested_by(full_name)
      `).eq('status', 'approved').order('created_at', { ascending: false })
      setQueue(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  const openProcess = (req: any) => {
    setSelected(req)
    setPaymentDate(new Date().toISOString().split('T')[0])
    setPaymentMethod('Bank Transfer')
    setPaymentReference('')
    setInvoiceRef('')
  }

  const submitProcess = async () => {
    if (!selected) return
    if (!paymentDate) return Alert.alert('Required', 'Payment date is required')
    if (!paymentReference.trim()) return Alert.alert('Required', 'Payment reference is required')

    setProcessing(true)
    try {
      const { error } = await supabase.from('payment_requests').update({
        status: 'paid',
        processed_by: profile.id,
        payment_date: paymentDate,
        payment_method: paymentMethod,
        payment_reference: paymentReference.trim(),
        invoice_ref: invoiceRef.trim() || null,
        processed_at: new Date().toISOString(),
      }).eq('id', selected.id)

      if (error) throw error
      Alert.alert('Success', 'Payment processed and recorded.')
      setSelected(null)
      await load()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setProcessing(false)
    }
  }

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity style={styles.card} onPress={() => openProcess(item)}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.sub_contractor?.name ?? '—'}</Text>
          <Text style={styles.cardSub}>{item.sub_contractor?.trade} · {item.project?.name}</Text>
        </View>
        <Text style={styles.cardAmt}>{fmt(item.amount, item.project?.currency)}</Text>
      </View>
      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>Requested by {item.requester?.full_name ?? '—'}</Text>
        <View style={styles.processBtn}>
          <Text style={styles.processBtnText}>Process →</Text>
        </View>
      </View>
    </TouchableOpacity>
  )

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
          <Text style={styles.headerTitle}>Payment Queue</Text>
        </View>
      </View>

      {queue.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyText}>Queue is clear</Text>
          <Text style={styles.emptySub}>No approved payments waiting to be processed.</Text>
        </View>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onRefresh={load}
          refreshing={loading}
        />
      )}

      {/* Process Payment Modal */}
      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView style={styles.modalSheet} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Process Payment</Text>

              {selected && (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryLabel}>Payee</Text>
                  <Text style={styles.summaryVal}>{selected.sub_contractor?.name}</Text>
                  <Text style={styles.summaryLabel}>Project</Text>
                  <Text style={styles.summaryVal}>{selected.project?.name}</Text>
                  <Text style={styles.summaryLabel}>Amount</Text>
                  <Text style={[styles.summaryVal, { color: GOLD, fontSize: 18 }]}>{fmt(selected.amount, selected.project?.currency)}</Text>
                </View>
              )}

              <Text style={styles.label}>Payment Method</Text>
              <TouchableOpacity style={styles.pickerField} onPress={() => setShowMethodPicker(true)}>
                <Text style={{ color: WHITE }}>{paymentMethod}</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Payment Date *</Text>
              <TextInput style={styles.input} value={paymentDate} onChangeText={setPaymentDate} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" />

              <Text style={styles.label}>Payment Reference / Voucher No. *</Text>
              <TextInput style={styles.input} value={paymentReference} onChangeText={setPaymentReference} placeholder="e.g. PV-2026-001" placeholderTextColor="#4a7a54" />

              <Text style={styles.label}>Invoice Reference (optional)</Text>
              <TextInput style={styles.input} value={invoiceRef} onChangeText={setInvoiceRef} placeholder="e.g. INV-00123" placeholderTextColor="#4a7a54" />

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelected(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, processing && { opacity: 0.6 }]} onPress={submitProcess} disabled={processing}>
                  {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Confirm Payment</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Method picker */}
      <Modal visible={showMethodPicker} animationType="slide" transparent onRequestClose={() => setShowMethodPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowMethodPicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.modalTitle}>Payment Method</Text>
            {PAYMENT_METHODS.map(m => (
              <TouchableOpacity key={m} style={styles.pickerRow} onPress={() => { setPaymentMethod(m); setShowMethodPicker(false) }}>
                <Text style={[styles.pickerRowText, m === paymentMethod && { color: GOLD, fontWeight: '700' }]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: GREEN, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  emptySub: { color: MUTED, fontSize: 13, textAlign: 'center' },
  card: { backgroundColor: MID, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: GOLD + '44' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: WHITE },
  cardSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  cardAmt: { fontSize: 16, fontWeight: '800', color: GOLD },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 11, color: MUTED },
  processBtn: { backgroundColor: GREEN, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  processBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: MID, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '88%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: WHITE, marginBottom: 16 },
  summaryBox: { backgroundColor: DARK, borderRadius: 10, padding: 14, marginBottom: 18 },
  summaryLabel: { fontSize: 10, color: MUTED, marginTop: 6 },
  summaryVal: { fontSize: 14, fontWeight: '700', color: WHITE },
  label: { fontSize: 12, fontWeight: '600', color: GOLD, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: DARK, borderWidth: 1, borderColor: BORD, borderRadius: 10, padding: 12, fontSize: 14, color: WHITE, marginBottom: 8 },
  pickerField: { backgroundColor: DARK, borderWidth: 1, borderColor: BORD, borderRadius: 10, padding: 13, marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 24 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: BORD, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: MUTED, fontWeight: '600' },
  submitBtn: { flex: 1, backgroundColor: GREEN, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  pickerSheet: { backgroundColor: MID, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
  pickerRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#1a2a1e' },
  pickerRowText: { fontSize: 14, color: WHITE },
})