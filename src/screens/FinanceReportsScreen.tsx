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
const BLUE  = '#64b5f6'

const SECTIONS = ['Summary', 'Outstanding', 'Payment Status', 'My Reports']

function fmt(n: number, cur = 'GHS') {
  return `${cur} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ProgressBar({ value, color = GOLD }: { value: number; color?: string }) {
  return (
    <View style={{ width: '100%', height: 7, backgroundColor: BORD, borderRadius: 99 }}>
      <View style={{ height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color, borderRadius: 99 }} />
    </View>
  )
}

export default function FinanceReportsScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState('Summary')
  const [projects, setProjects] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [paymentReqs, setPaymentReqs] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [userId, setUserId] = useState('')
  const [viewReport, setViewReport] = useState<any>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data: prof } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
      if (!prof?.organization_id) return
      const orgId = prof.organization_id

      const [p, e, r, myReports] = await Promise.all([
        supabase.from('projects').select('*').eq('organization_id', orgId).order('name'),
        supabase.from('expenses').select('*, vendor:vendors!vendor_id(name)').order('id', { ascending: false }),
        supabase.from('payment_requests').select('*, project:projects!project_id(name, currency), sub_contractor:sub_contractors!sub_contractor_id(name, trade)').order('created_at', { ascending: false }),
        supabase.from('general_reports').select('*, project:projects!project_id(name), recipient:profiles!recipient_id(full_name)').eq('submitted_by', user.id).order('created_at', { ascending: false }),
      ])
      setProjects(p.data ?? [])
      setExpenses(e.data ?? [])
      setPaymentReqs(r.data ?? [])
      setReports(myReports.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  const totalBudget = projects.reduce((s, p) => s + Number(p.budget || 0), 0)
  const totalExpenditure = projects.reduce((s, p) => s + Number(p.expenditure || 0), 0)
  const totalExpenseAmt = expenses.reduce((s, e) => s + Number(e.total_amount || 0), 0)
  const totalOutstanding = expenses.reduce((s, e) => s + Number(e.balance_due || 0), 0)
  const totalPaidCash = expenses.reduce((s, e) => s + Number(e.amount_paid || 0), 0)
  const utilization = totalBudget > 0 ? (totalExpenditure / totalBudget) * 100 : 0
  const utilizationColor = utilization > 90 ? RED : utilization > 70 ? GOLD : GREEN

  const paid = expenses.filter(e => e.status === 'Paid')
  const pending = expenses.filter(e => e.status === 'Pending')
  const partial = expenses.filter(e => e.status === 'Partial')

  const outstanding = expenses.filter(e => Number(e.balance_due) > 0).sort((a, b) => Number(b.balance_due) - Number(a.balance_due))

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
          <Text style={styles.headerEyebrow}>FINANCE DIRECTOR</Text>
          <Text style={styles.headerTitle}>Financial Reports</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={{ paddingHorizontal: 16 }}>
        {SECTIONS.map(s => (
          <TouchableOpacity key={s} style={[styles.tabBtn, section === s && styles.tabBtnActive]} onPress={() => setSection(s)}>
            <Text style={[styles.tabText, section === s && styles.tabTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {section === 'Summary' && (
          <>
            <View style={styles.kpiGrid}>
              {[
                { label: 'Approved Budget', val: fmt(totalBudget), color: GREEN, sub: `${projects.length} projects` },
                { label: 'Total Expenditure', val: fmt(totalExpenditure), color: RED, sub: `${totalBudget > 0 ? ((totalExpenditure / totalBudget) * 100).toFixed(1) : 0}% of budget` },
                { label: 'Remaining Budget', val: fmt(totalBudget - totalExpenditure), color: totalBudget - totalExpenditure < 0 ? RED : GREEN, sub: totalBudget - totalExpenditure < 0 ? 'Over budget' : 'Available' },
                { label: 'Total Outstanding', val: fmt(totalOutstanding), color: RED, sub: 'Balance due' },
                { label: 'Total Paid', val: fmt(totalPaidCash), color: GREEN, sub: 'Cash disbursed' },
                { label: 'Expenses Logged', val: fmt(totalExpenseAmt), color: GOLD, sub: `${expenses.length} records` },
              ].map(k => (
                <View key={k.label} style={styles.kpiCard}>
                  <Text style={styles.kpiLabel}>{k.label}</Text>
                  <Text style={[styles.kpiVal, { color: k.color }]}>{k.val}</Text>
                  <Text style={styles.kpiSub}>{k.sub}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={styles.cardTitle}>Overall Budget Utilization</Text>
                <Text style={{ color: utilizationColor, fontWeight: '800', fontSize: 18 }}>{utilization.toFixed(1)}%</Text>
              </View>
              <ProgressBar value={utilization} color={utilizationColor} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Invoice Status Breakdown</Text>
              <Text style={styles.cardSub}>See the KPIs above for actual amounts</Text>
              {[
                { label: 'Paid', count: paid.length, color: GREEN },
                { label: 'Pending', count: pending.length, color: GOLD },
                { label: 'Partial', count: partial.length, color: BLUE },
              ].map(s => (
                <View key={s.label} style={{ marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: MUTED, fontSize: 12 }}>{s.label}</Text>
                    <Text style={{ color: s.color, fontWeight: '800', fontSize: 15 }}>{s.count}</Text>
                  </View>
                  <ProgressBar value={expenses.length > 0 ? (s.count / expenses.length) * 100 : 0} color={s.color} />
                </View>
              ))}
            </View>
          </>
        )}

        {section === 'Outstanding' && (
          <>
            <View style={styles.alertBox}>
              <Text style={styles.alertText}>Total Outstanding: {fmt(totalOutstanding)}</Text>
              <Text style={styles.alertSub}>across {outstanding.length} records</Text>
            </View>
            {outstanding.length === 0 ? (
              <Text style={styles.emptyText}>All balances cleared. No outstanding payments.</Text>
            ) : outstanding.map(e => {
              const proj = projects.find(p => p.id === e.project_id)
              return (
                <View key={e.id} style={styles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{e.item ?? '—'}</Text>
                      <Text style={styles.rowMeta}>{proj?.name ?? '—'} · {e.vendor?.name ?? '—'}</Text>
                    </View>
                    <View style={{ padding: 2, paddingHorizontal: 8, borderRadius: 20, backgroundColor: GOLD + '22' }}>
                      <Text style={{ color: GOLD, fontSize: 10, fontWeight: '700' }}>{e.status}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                    <View><Text style={styles.miniLabel}>Total</Text><Text style={{ color: GOLD, fontWeight: '700', fontSize: 13 }}>{fmt(e.total_amount)}</Text></View>
                    <View><Text style={styles.miniLabel}>Paid</Text><Text style={{ color: GREEN, fontWeight: '700', fontSize: 13 }}>{fmt(e.amount_paid ?? 0)}</Text></View>
                    <View><Text style={styles.miniLabel}>Balance</Text><Text style={{ color: RED, fontWeight: '800', fontSize: 15 }}>{fmt(e.balance_due)}</Text></View>
                  </View>
                </View>
              )
            })}
          </>
        )}

        {section === 'Payment Status' && (
          <>
            <View style={styles.statRow}>
              {[
                { label: 'Invoiced', val: totalExpenseAmt, color: GOLD },
                { label: 'Paid', val: totalPaidCash, color: GREEN },
                { label: 'Outstanding', val: totalOutstanding, color: RED },
              ].map(s => (
                <View key={s.label} style={[styles.statCard, { borderColor: s.color + '44' }]}>
                  <Text style={styles.kpiLabel}>{s.label}</Text>
                  <Text style={{ color: s.color, fontWeight: '800', fontSize: 15 }}>{fmt(s.val)}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Sub-contractor Payment Requests</Text>
            {paymentReqs.length === 0 ? (
              <Text style={styles.emptyText}>No payment requests.</Text>
            ) : paymentReqs.map(r => {
              const c = r.status === 'paid' ? GREEN : r.status === 'approved' ? BLUE : r.status === 'rejected' ? RED : GOLD
              return (
                <View key={r.id} style={styles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{r.sub_contractor?.name ?? '—'}</Text>
                      <Text style={styles.rowMeta}>{r.sub_contractor?.trade ?? '—'} · {r.project?.name ?? '—'}</Text>
                    </View>
                    <View style={{ padding: 2, paddingHorizontal: 8, borderRadius: 20, backgroundColor: c + '22' }}>
                      <Text style={{ color: c, fontSize: 10, fontWeight: '700' }}>{r.status}</Text>
                    </View>
                  </View>
                  <Text style={{ color: GOLD, fontWeight: '700', fontSize: 14, marginTop: 8 }}>{fmt(r.amount, r.project?.currency)}</Text>
                </View>
              )
            })}
          </>
        )}

        {section === 'My Reports' && (
          reports.length === 0 ? (
            <Text style={styles.emptyText}>No reports yet. Create one from the web dashboard.</Text>
          ) : reports.map(r => {
            const statusColor = r.status === 'reviewed' ? GREEN : r.status === 'submitted' ? GOLD : MUTED
            const statusLabel = r.status === 'reviewed' ? 'Reviewed' : r.status === 'submitted' ? 'Submitted' : 'Draft'
            return (
              <TouchableOpacity key={r.id} style={styles.card} onPress={() => setViewReport(r)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{r.title}</Text>
                    <Text style={styles.rowMeta}>{r.report_type}</Text>
                    {r.project?.name && <Text style={styles.rowMeta}>📁 {r.project.name}</Text>}
                    <Text style={styles.rowMeta}>{new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  </View>
                  <View style={{ padding: 3, paddingHorizontal: 10, borderRadius: 20, backgroundColor: statusColor + '22' }}>
                    <Text style={{ color: statusColor, fontSize: 10, fontWeight: '700' }}>{statusLabel}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>

      {/* View Report modal — read only */}
      <Modal visible={!!viewReport} animationType="slide" transparent onRequestClose={() => setViewReport(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.reportSheet}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: GOLD, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{viewReport?.report_type}</Text>
                  <Text style={styles.modalTitle}>{viewReport?.title}</Text>
                </View>
                <TouchableOpacity onPress={() => setViewReport(null)} style={styles.closeBtn}><Text style={{ color: MUTED, fontSize: 16 }}>✕</Text></TouchableOpacity>
              </View>

              {viewReport?.financial_snapshot && (
                <>
                  <View style={{ backgroundColor: DARK, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: GOLD + '33', marginBottom: 16 }}>
                    <Text style={{ color: '#c0b898', fontSize: 13, lineHeight: 20 }}>{viewReport.financial_snapshot.autoDescription}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {[
                      { label: 'Period Expenditure', val: fmt(viewReport.financial_snapshot.totals.periodExpenditure), color: RED },
                      { label: 'Budget Utilized', val: `${viewReport.financial_snapshot.totals.utilizationPct.toFixed(1)}%`, color: GOLD },
                      { label: 'Cash Paid', val: fmt(viewReport.financial_snapshot.totals.periodPaidCash), color: GREEN },
                      { label: 'Outstanding', val: fmt(viewReport.financial_snapshot.totals.currentOutstanding), color: RED },
                    ].map(k => (
                      <View key={k.label} style={{ width: '47%', backgroundColor: DARK, borderRadius: 10, padding: 10 }}>
                        <Text style={{ color: MUTED, fontSize: 10, marginBottom: 4 }}>{k.label}</Text>
                        <Text style={{ color: k.color, fontWeight: '700', fontSize: 14 }}>{k.val}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {[
                { label: 'Management Commentary', val: viewReport?.summary },
                { label: 'Variance Explanation', val: viewReport?.content },
                { label: 'Risk Factors', val: viewReport?.challenges },
                { label: 'Key Assumptions / Notes', val: viewReport?.key_assumptions },
                { label: 'Recommendations', val: viewReport?.recommendations },
                { label: 'Conclusion', val: viewReport?.next_steps },
              ].filter(s => s.val).map(s => (
                <View key={s.label} style={{ marginBottom: 16 }}>
                  <Text style={{ color: GOLD, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: '700' }}>{s.label}</Text>
                  <View style={{ backgroundColor: DARK, borderRadius: 10, padding: 12 }}>
                    <Text style={{ color: '#c0b898', fontSize: 13, lineHeight: 20 }}>{s.val}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
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
  tabRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORD },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, marginRight: 8, backgroundColor: MID },
  tabBtnActive: { backgroundColor: GOLD },
  tabText: { fontSize: 12, fontWeight: '600', color: MUTED },
  tabTextActive: { color: DARK },
  scrollContent: { padding: 16, paddingBottom: 40 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  kpiCard: { width: '47%', backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 12, padding: 14 },
  kpiLabel: { fontSize: 11, color: MUTED, marginBottom: 6 },
  kpiVal: { fontSize: 16, fontWeight: '800', marginBottom: 3 },
  kpiSub: { fontSize: 10, color: MUTED },
  card: { backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: WHITE },
  cardSub: { fontSize: 11, color: MUTED, marginBottom: 4 },
  alertBox: { backgroundColor: '#2e1a0e', borderWidth: 1, borderColor: '#ef535044', borderRadius: 12, padding: 14, marginBottom: 16 },
  alertText: { color: RED, fontWeight: '700', fontSize: 14 },
  alertSub: { color: MUTED, fontSize: 12, marginTop: 2 },
  emptyText: { color: MUTED, fontSize: 13, textAlign: 'center', paddingVertical: 40 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: WHITE },
  rowMeta: { fontSize: 11, color: MUTED, marginTop: 2 },
  miniLabel: { fontSize: 9, color: MUTED, marginBottom: 2 },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: MID, borderWidth: 1, borderRadius: 12, padding: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: GOLD, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  reportSheet: { backgroundColor: MID, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: WHITE },
  closeBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: BORD, alignItems: 'center', justifyContent: 'center' },
})