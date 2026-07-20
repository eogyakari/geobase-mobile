import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, SafeAreaView, Modal,
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
const PURPLE = '#c084fc'
const BLUE = '#64b5f6'
const ORANGE = '#ef8c35'

function fmt(n: number, cur = 'GHS') {
  return `${cur} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ProgressBar({ value, color = GOLD }: { value: number; color?: string }) {
  return (
    <View style={{ width: '100%', height: 9, backgroundColor: BORD, borderRadius: 99 }}>
      <View style={{ height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color, borderRadius: 99 }} />
    </View>
  )
}

export default function AuditorScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [paymentReqs, setPaymentReqs] = useState<any[]>([])
  const [procItems, setProcItems] = useState<any[]>([])
  const [procInvoices, setProcInvoices] = useState<any[]>([])
  const [filterProjId, setFilterProjId] = useState('all')
  const [showProjectPicker, setShowProjectPicker] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
      if (!prof?.organization_id) return
      const orgId = prof.organization_id

      const [p, e, r, pi, inv] = await Promise.all([
        supabase.from('projects').select('*').eq('organization_id', orgId).order('name'),
        supabase.from('expenses').select('*, vendor:vendors!vendor_id(name)').order('id', { ascending: false }),
        supabase.from('payment_requests').select('*, project:projects!project_id(name, currency), sub_contractor:sub_contractors!sub_contractor_id(name, trade)').order('created_at', { ascending: false }),
        supabase.from('procurement_items').select('*, project:projects!project_id(name)').order('created_at', { ascending: false }),
        supabase.from('procurement_invoices').select('*, item:procurement_items!procurement_item_id(title,region)').order('created_at', { ascending: false }),
      ])
      setProjects(p.data ?? [])
      setExpenses(e.data ?? [])
      setPaymentReqs(r.data ?? [])
      setProcItems(pi.data ?? [])
      setProcInvoices(inv.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  const totalBudget = projects.reduce((s, p) => s + Number(p.budget || 0), 0)
  const totalExpenditure = projects.reduce((s, p) => s + Number(p.expenditure || 0), 0)
  const totalExpenses = expenses.reduce((s, e) => s + Number(e.total_amount || 0), 0)
  const totalOutstanding = expenses.reduce((s, e) => s + Number(e.balance_due || 0), 0)
  const overBudget = projects.filter(p => Number(p.expenditure) > Number(p.budget))
  const compliance = projects.length > 0 ? ((projects.length - overBudget.length) / projects.length) * 100 : 100
  const complianceColor = compliance >= 90 ? GREEN : compliance >= 70 ? GOLD : RED
  const pendingPay = paymentReqs.filter(r => r.status === 'pending')
  const awardedWOVet = procItems.filter(i => i.status === 'awarded' && !procInvoices.some(inv => inv.procurement_item_id === i.id && inv.ai_vetted))

  const filteredProjList = filterProjId === 'all' ? projects : projects.filter(p => p.id === filterProjId)
  const filteredBudget = filteredProjList.reduce((s, p) => s + Number(p.budget || 0), 0)
  const filteredExpenditure = filteredProjList.reduce((s, p) => s + Number(p.expenditure || 0), 0)
  const filteredUtilization = filteredBudget > 0 ? (filteredExpenditure / filteredBudget) * 100 : 0
  const filteredUtilColor = filteredUtilization > 90 ? RED : filteredUtilization > 70 ? GOLD : GREEN

  const flags = [
    ...overBudget.map(p => ({ type: 'Budget', label: `${p.name} is over budget by ${fmt(Number(p.expenditure) - Number(p.budget), p.currency ?? 'GHS')}`, severity: 'high' })),
    ...pendingPay.map(r => ({ type: 'Payment', label: `Payment request for ${fmt(r.amount, r.project?.currency)} (${r.sub_contractor?.name}) is pending`, severity: 'medium' })),
    ...awardedWOVet.map(i => ({ type: 'Procurement', label: `"${i.title}" was awarded without AI vetting`, severity: 'medium' })),
    ...expenses.filter(e => Number(e.balance_due) > 0).slice(0, 3).map(e => ({ type: 'Outstanding', label: `${e.item ?? 'Expense'} has outstanding balance of ${fmt(e.balance_due)}`, severity: 'low' })),
  ]

  const selectedProjName = filterProjId === 'all' ? 'All Projects' : projects.find(p => p.id === filterProjId)?.name ?? 'All Projects'

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
          <Text style={styles.headerEyebrow}>GEOBASE · AUDIT</Text>
          <Text style={styles.headerTitle}>Auditor Overview</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.subtitle}>Read-only audit view across all financial and operational records.</Text>

        <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowProjectPicker(true)}>
          <Text style={styles.selectorText}>{selectedProjName}</Text>
          <Text style={{ color: MUTED, fontSize: 12 }}>▾</Text>
        </TouchableOpacity>

        <View style={styles.kpiGrid}>
          {[
            { label: 'Compliance Score', val: `${compliance.toFixed(1)}%`, color: complianceColor },
            { label: 'Projects Over Budget', val: overBudget.length, color: overBudget.length > 0 ? RED : GREEN },
            { label: 'Total Outstanding', val: fmt(totalOutstanding), color: ORANGE },
            { label: 'Pending Payments', val: pendingPay.length, color: GOLD },
          ].map(k => (
            <View key={k.label} style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>{k.label}</Text>
              <Text style={[styles.kpiVal, { color: k.color }]}>{k.val}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={styles.cardTitle}>{filterProjId === 'all' ? 'Organisation Budget Utilization' : `Utilization — ${selectedProjName}`}</Text>
            <Text style={{ color: filteredUtilColor, fontWeight: '800', fontSize: 18 }}>{filteredUtilization.toFixed(1)}%</Text>
          </View>
          <ProgressBar value={filteredUtilization} color={filteredUtilColor} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Text style={{ color: RED, fontSize: 11 }}>Spent: {fmt(filteredExpenditure)}</Text>
            <Text style={{ color: GREEN, fontSize: 11 }}>Remaining: {fmt(filteredBudget - filteredExpenditure)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Text style={styles.cardTitle}>⚑ Audit Risk Flags</Text>
            <Text style={{ marginLeft: 'auto', color: RED, fontWeight: '700', fontSize: 12 }}>{flags.length} flag{flags.length !== 1 ? 's' : ''}</Text>
          </View>
          {flags.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ fontSize: 28, marginBottom: 8 }}>✅</Text>
              <Text style={{ color: GREEN, fontWeight: '700', fontSize: 13 }}>No risk flags detected</Text>
              <Text style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>All financial records appear compliant.</Text>
            </View>
          ) : flags.map((f, i) => {
            const sColor = f.severity === 'high' ? RED : f.severity === 'medium' ? GOLD : MUTED
            return (
              <View key={i} style={[styles.flagRow, i === 0 && { borderTopWidth: 0 }]}>
                <View style={{ padding: 2, paddingHorizontal: 8, borderRadius: 10, backgroundColor: sColor + '22', alignSelf: 'flex-start', marginBottom: 4 }}>
                  <Text style={{ color: sColor, fontSize: 9, fontWeight: '700' }}>{f.type}</Text>
                </View>
                <Text style={{ color: '#c0b898', fontSize: 12, lineHeight: 17 }}>{f.label}</Text>
              </View>
            )
          })}
        </View>

        <Text style={styles.sectionLabel}>Summary</Text>
        <View style={styles.summaryGrid}>
          {[
            { label: 'Total Budget', val: fmt(totalBudget), color: GOLD },
            { label: 'Total Expenditure', val: fmt(totalExpenditure), color: RED },
            { label: 'Expenses Logged', val: fmt(totalExpenses), color: BLUE },
            { label: 'Outstanding Payables', val: fmt(totalOutstanding), color: ORANGE },
            { label: 'Payment Requests', val: paymentReqs.length, color: PURPLE },
            { label: 'Procurement Items', val: procItems.length, color: GREEN },
          ].map(s => (
            <View key={s.label} style={styles.summaryCard}>
              <Text style={styles.kpiLabel}>{s.label}</Text>
              <Text style={{ color: s.color, fontWeight: '700', fontSize: 15 }}>{s.val}</Text>
            </View>
          ))}
        </View>

        <View style={styles.webNote}>
          <Text style={styles.webNoteText}>Detailed Project, Expense, Payment, Petty Cash, and Procurement audit tables are available on the web dashboard.</Text>
        </View>
      </ScrollView>

      <Modal visible={showProjectPicker} animationType="slide" transparent onRequestClose={() => setShowProjectPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowProjectPicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.modalTitle}>Filter by Project</Text>
            <ScrollView>
              <TouchableOpacity style={styles.pickerRow} onPress={() => { setFilterProjId('all'); setShowProjectPicker(false) }}>
                <Text style={[styles.pickerRowText, filterProjId === 'all' && { color: GOLD, fontWeight: '700' }]}>All Projects</Text>
              </TouchableOpacity>
              {projects.map(p => (
                <TouchableOpacity key={p.id} style={styles.pickerRow} onPress={() => { setFilterProjId(p.id); setShowProjectPicker(false) }}>
                  <Text style={[styles.pickerRowText, p.id === filterProjId && { color: GOLD, fontWeight: '700' }]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
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
  scrollContent: { padding: 16, paddingBottom: 40 },
  subtitle: { fontSize: 12, color: MUTED, marginBottom: 14, lineHeight: 17 },
  selectorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 16 },
  selectorText: { color: WHITE, fontSize: 14, fontWeight: '600' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  kpiCard: { width: '47%', backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 12, padding: 14 },
  kpiLabel: { fontSize: 11, color: MUTED, marginBottom: 6 },
  kpiVal: { fontSize: 17, fontWeight: '800' },
  card: { backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 14, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: WHITE },
  flagRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1a2a1e' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: GOLD, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  summaryCard: { width: '47%', backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 12, padding: 14 },
  webNote: { backgroundColor: '#0f1e14', borderWidth: 1, borderColor: BORD, borderRadius: 12, padding: 14 },
  webNoteText: { color: MUTED, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: MID, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: WHITE, marginBottom: 16 },
  pickerRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#1a2a1e' },
  pickerRowText: { fontSize: 14, color: WHITE },
})