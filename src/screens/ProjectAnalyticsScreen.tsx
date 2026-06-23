import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, SafeAreaView,
  Modal, FlatList,
} from 'react-native'
import { supabase } from '../lib/supabase'

const GOLD  = '#c9a84c'
const DARK  = '#0a1209'
const MID   = '#152019'
const BORD  = '#1e3320'
const MUTED = '#8a9e8d'
const WHITE = '#e8e0d0'

function fmt(n: number, currency = 'GHS') {
  return `${currency} ${Number(n || 0).toLocaleString()}`
}

function ProgressBar({ value, color = GOLD }: { value: number; color?: string }) {
  return (
    <View style={{ width: '100%', height: 7, backgroundColor: BORD, borderRadius: 99, overflow: 'hidden' }}>
      <View style={{ height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color, borderRadius: 99 }} />
    </View>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, backgroundColor: color + '22', borderWidth: 1, borderColor: color + '44' }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{label}</Text>
    </View>
  )
}

export default function ProjectAnalyticsScreen({ navigation }: any) {
  const [loading,    setLoading]    = useState(true)
  const [profile,    setProfile]    = useState<any>(null)
  const [projects,   setProjects]   = useState<any[]>([])
  const [expenses,   setExpenses]   = useState<any[]>([])
  const [selectedID, setSelectedID] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, full_name, organization_id, role:roles!role_id(name)')
        .eq('id', user.id)
        .single()

      const roleName = (prof?.role as any)?.name ?? null
      setProfile({ ...prof, role_name: roleName })

      if (!prof?.organization_id) { setLoading(false); return }

      const [p, e] = await Promise.all([
        supabase.from('projects').select('*').eq('organization_id', prof.organization_id),
        supabase.from('expenses').select('*').order('id', { ascending: false }),
      ])

      setProjects(p.data ?? [])
      setExpenses(e.data ?? [])
    } catch (err) {
      console.error('[Project analytics load error]', err)
    } finally {
      setLoading(false)
    }
  }

  const sp = projects.find(p => p.id === selectedID)
  const today = new Date()

  const totalBudget      = projects.reduce((s, p) => s + Number(p.budget || 0), 0)
  const totalExpenditure = projects.reduce((s, p) => s + Number(p.expenditure || 0), 0)
  const remaining        = totalBudget - totalExpenditure

  const utilization = sp?.budget ? Math.round((sp.expenditure / sp.budget) * 100) : 0

  const daysRemaining = sp?.end_date
    ? Math.max(0, Math.ceil((new Date(sp.end_date).getTime() - today.getTime()) / 86400000)) : 0

  const timelineProgress = (() => {
    if (!sp?.start_date || !sp?.end_date) return 0
    const start = new Date(sp.start_date).getTime()
    const end   = new Date(sp.end_date).getTime()
    const dur   = end - start
    if (dur <= 0) return 100
    return Math.min(100, Math.max(0, Math.round((today.getTime() - start) / dur * 100)))
  })()

  const budgetHealth = utilization > 100 ? 'Critical' : utilization > 70 ? 'Warning' : 'Healthy'
  const budgetHealthColor = budgetHealth === 'Healthy' ? '#4caf50' : budgetHealth === 'Warning' ? GOLD : '#ef5350'

  const aiPrediction =
    utilization > timelineProgress + 25 ? 'Budget Risk' :
    timelineProgress > utilization + 25 ? 'Schedule Risk' :
    utilization > 90                    ? 'Critical Risk' : 'On Track'

  const aiColor =
    aiPrediction === 'On Track'      ? '#4caf50' :
    aiPrediction === 'Budget Risk'   ? GOLD :
    aiPrediction === 'Schedule Risk' ? '#64b5f6' : '#ef5350'

  const aiDesc: Record<string, string> = {
    'On Track':      'Project spending and timeline are well aligned.',
    'Budget Risk':   'Budget consumption is outpacing project progress.',
    'Schedule Risk': 'Timeline progression is slower than expected.',
    'Critical Risk': 'Project requires immediate executive attention.',
  }

  const riskLevel = sp
    ? sp.expenditure > sp.budget       ? 'Critical Risk'
    : sp.expenditure > sp.budget * 0.7 ? 'Medium Risk'
    : 'Low Risk' : null

  const riskColor =
    riskLevel === 'Critical Risk' ? '#ef5350' :
    riskLevel === 'Medium Risk'   ? GOLD : '#4caf50'

  const projectPurchases = sp
    ? expenses.filter(e => e.project_id === sp.id).slice(0, 6)
    : []

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: GOLD, fontSize: 18 }}>‹</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.headerEyebrow}>GEOBASE · ANALYTICS</Text>
          <Text style={styles.headerTitle}>Project Analytics</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Project selector */}
        <TouchableOpacity style={styles.selectorBtn} onPress={() => setPickerOpen(true)}>
          <Text style={styles.selectorText}>{sp ? sp.name : 'All Projects'}</Text>
          <Text style={{ color: MUTED, fontSize: 12 }}>▾</Text>
        </TouchableOpacity>

        {/* Summary KPI cards */}
        <View style={styles.kpiRow}>
          {[
            { label: 'Total Budget',      val: fmt(totalBudget),      color: GOLD },
            { label: 'Total Expenditure', val: fmt(totalExpenditure), color: '#ef5350' },
            { label: 'Remaining',         val: fmt(remaining),        color: '#4caf50' },
          ].map(({ label, val, color }) => (
            <View key={label} style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>{label}</Text>
              <Text style={[styles.kpiVal, { color }]} numberOfLines={1}>{val}</Text>
            </View>
          ))}
        </View>

        {!sp ? (
          /* ── Project list overview ── */
          <View style={styles.card}>
            <Text style={styles.cardTitle}>All Projects</Text>
            <Text style={styles.cardSub}>Tap a project for detailed analytics</Text>
            {projects.length === 0 ? (
              <Text style={styles.emptyText}>No projects yet.</Text>
            ) : projects.map(p => {
              const used = p.budget ? Math.round((p.expenditure / p.budget) * 100) : 0
              const usedColor = used > 90 ? '#ef5350' : used > 70 ? GOLD : '#4caf50'
              return (
                <TouchableOpacity key={p.id} style={styles.projectRow} onPress={() => setSelectedID(p.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.projectName}>{p.name}</Text>
                    <View style={{ marginTop: 6 }}>
                      <ProgressBar value={used} color={usedColor} />
                    </View>
                  </View>
                  <Text style={[styles.projectPct, { color: usedColor }]}>{used}%</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        ) : (
          /* ── Selected project detail ── */
          <View style={{ gap: 14 }}>

            {/* Header card */}
            <View style={[styles.card, { borderColor: GOLD + '44' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eyebrow}>SELECTED PROJECT</Text>
                  <Text style={styles.projectTitle}>{sp.name}</Text>
                  {sp.client ? <Text style={styles.cardSub}>{sp.client}</Text> : null}
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {riskLevel && <Badge label={riskLevel} color={riskColor} />}
                <Badge label={sp.status ?? 'Pending'} color={GOLD} />
              </View>
            </View>

            {/* Budget + dates grid */}
            <View style={styles.gridRow}>
              <View style={styles.gridCell}>
                <Text style={[styles.gridLabel, { color: GOLD }]}>BUDGET</Text>
                <Text style={styles.gridVal}>{fmt(sp.budget, sp.currency)}</Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={[styles.gridLabel, { color: '#ef5350' }]}>EXPENDITURE</Text>
                <Text style={styles.gridVal}>{fmt(sp.expenditure, sp.currency)}</Text>
              </View>
            </View>
            <View style={styles.gridRow}>
              <View style={styles.gridCell}>
                <Text style={[styles.gridLabel, { color: '#64b5f6' }]}>START DATE</Text>
                <Text style={styles.gridVal}>{sp.start_date ?? '—'}</Text>
              </View>
              <View style={styles.gridCell}>
                <Text style={[styles.gridLabel, { color: '#ef5350' }]}>END DATE</Text>
                <Text style={styles.gridVal}>{sp.end_date ?? '—'}</Text>
              </View>
            </View>

            {/* Metrics card */}
            <View style={styles.card}>
              <View style={styles.metricRow}>
                <Text style={styles.metricLabel}>Budget Utilization</Text>
                <Text style={[styles.metricVal, { color: utilization > 90 ? '#ef5350' : GOLD }]}>{utilization}%</Text>
              </View>
              <ProgressBar value={utilization} color={utilization > 100 ? '#ef5350' : utilization > 70 ? GOLD : '#4caf50'} />

              <View style={[styles.metricRow, { marginTop: 18 }]}>
                <Text style={styles.metricLabel}>Timeline Progress</Text>
                <Text style={[styles.metricVal, { color: '#64b5f6' }]}>{timelineProgress}%</Text>
              </View>
              <ProgressBar value={timelineProgress} color="#64b5f6" />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={styles.dateLabel}>{sp.start_date ?? '—'}</Text>
                <Text style={styles.dateLabel}>{sp.end_date ?? '—'}</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <View style={styles.miniStat}>
                  <Text style={[styles.miniStatVal, { color: GOLD }]}>{daysRemaining}</Text>
                  <Text style={styles.miniStatLabel}>Days Remaining</Text>
                </View>
                <View style={styles.miniStat}>
                  <Text style={[styles.miniStatVal, { color: budgetHealthColor }]}>{budgetHealth}</Text>
                  <Text style={styles.miniStatLabel}>Budget Health</Text>
                </View>
              </View>
            </View>

            {/* AI Insight */}
            <View style={[styles.card, { borderColor: aiColor + '44' }]}>
              <Text style={styles.eyebrow}>AI PROJECT INSIGHT</Text>
              <Text style={[styles.aiTitle, { color: aiColor }]}>{aiPrediction}</Text>
              <Text style={styles.cardSub}>{aiDesc[aiPrediction]}</Text>
            </View>

            {/* Recent Purchases */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Recent Purchases</Text>
              {projectPurchases.length === 0 ? (
                <Text style={styles.emptyText}>No purchases recorded for this project yet.</Text>
              ) : projectPurchases.map((e, i) => (
                <View key={e.id} style={[styles.purchaseRow, i === projectPurchases.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.purchaseTitle}>{e.title}</Text>
                    <Text style={styles.purchaseSub}>{e.vendor || '—'} · {e.category}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.purchaseAmt}>{fmt(e.amount)}</Text>
                    <Badge
                      label={e.payment_status}
                      color={e.payment_status === 'Paid' ? '#4caf50' : GOLD}
                    />
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.backToAllBtn} onPress={() => setSelectedID('')}>
              <Text style={{ color: GOLD, fontSize: 13, fontWeight: '700' }}>← Back to all projects</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Project picker modal */}
      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Project</Text>
            <FlatList
              data={[{ id: '', name: 'All Projects' }, ...projects]}
              keyExtractor={item => item.id || 'all'}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => { setSelectedID(item.id); setPickerOpen(false) }}
                >
                  <Text style={[styles.modalRowText, item.id === selectedID && { color: GOLD, fontWeight: '700' }]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: DARK },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORD,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: MID,
    borderWidth: 1, borderColor: BORD, alignItems: 'center', justifyContent: 'center',
  },
  headerEyebrow: { fontSize: 10, color: GOLD, letterSpacing: 1.5, marginBottom: 2 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: WHITE },
  scrollContent: { padding: 16, paddingBottom: 40 },
  selectorBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: MID, borderWidth: 1, borderColor: BORD,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 14,
  },
  selectorText: { color: WHITE, fontSize: 14, fontWeight: '600' },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  kpiCard: {
    flex: 1, backgroundColor: MID, borderWidth: 1, borderColor: BORD,
    borderRadius: 12, padding: 12,
  },
  kpiLabel: { fontSize: 10, color: MUTED, marginBottom: 6 },
  kpiVal: { fontSize: 14, fontWeight: '800' },
  card: {
    backgroundColor: MID, borderWidth: 1, borderColor: BORD,
    borderRadius: 14, padding: 16, marginBottom: 14,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: WHITE, marginBottom: 4 },
  cardSub: { fontSize: 12, color: MUTED, lineHeight: 18 },
  emptyText: { fontSize: 13, color: MUTED, textAlign: 'center', paddingVertical: 24 },
  projectRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a2a1e',
  },
  projectName: { fontSize: 13, fontWeight: '600', color: WHITE, marginBottom: 4 },
  projectPct: { fontSize: 13, fontWeight: '700', minWidth: 38, textAlign: 'right' },
  eyebrow: { fontSize: 10, color: GOLD, letterSpacing: 1.2, marginBottom: 4 },
  projectTitle: { fontSize: 18, fontWeight: '800', color: WHITE },
  gridRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  gridCell: {
    flex: 1, backgroundColor: MID, borderWidth: 1, borderColor: BORD,
    borderRadius: 12, padding: 14,
  },
  gridLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  gridVal: { fontSize: 15, fontWeight: '700', color: WHITE },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  metricLabel: { fontSize: 13, fontWeight: '600', color: WHITE },
  metricVal: { fontSize: 16, fontWeight: '800' },
  dateLabel: { fontSize: 11, color: MUTED },
  miniStat: {
    flex: 1, backgroundColor: DARK, borderWidth: 1, borderColor: BORD,
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
  miniStatVal: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  miniStatLabel: { fontSize: 10, color: MUTED },
  aiTitle: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  purchaseRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a2a1e', gap: 10,
  },
  purchaseTitle: { fontSize: 13, fontWeight: '600', color: WHITE },
  purchaseSub: { fontSize: 11, color: MUTED, marginTop: 2 },
  purchaseAmt: { fontSize: 13, fontWeight: '700', color: GOLD, marginBottom: 4 },
  backToAllBtn: { alignItems: 'center', paddingVertical: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: MID, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '70%',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: WHITE, marginBottom: 14 },
  modalRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#1a2a1e' },
  modalRowText: { fontSize: 14, color: WHITE },
})