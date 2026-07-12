import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, SafeAreaView, Alert, FlatList,
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

export default function ApprovePaymentRequestScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState<any[]>([])
  const [actingId, setActingId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data } = await supabase.from('payment_requests').select(`
        *, project:projects!project_id(name, currency),
        sub_contractor:sub_contractors!sub_contractor_id(name, trade),
        requester:profiles!requested_by(full_name)
      `).eq('status', 'pending').order('created_at', { ascending: false })
      setRequests(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  const decide = async (req: any, decision: 'approved' | 'rejected') => {
    setActingId(req.id)
    try {
      const { error } = await supabase.from('payment_requests').update({ status: decision }).eq('id', req.id)
      if (error) throw error
      setRequests(prev => prev.filter(r => r.id !== req.id))
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setActingId(null)
    }
  }

  const confirmDecision = (req: any, decision: 'approved' | 'rejected') => {
    const payee = req.sub_contractor?.name ?? req.other_description ?? 'this request'
    Alert.alert(
      decision === 'approved' ? 'Approve Request?' : 'Reject Request?',
      `${decision === 'approved' ? 'Approve' : 'Reject'} payment of ${fmt(req.amount, req.project?.currency)} to ${payee}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: decision === 'approved' ? 'Approve' : 'Reject', style: decision === 'rejected' ? 'destructive' : 'default', onPress: () => decide(req, decision) },
      ]
    )
  }

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.sub_contractor?.name ?? item.other_description ?? '—'}</Text>
          <Text style={styles.cardSub}>
            {item.sub_contractor?.trade ? `${item.sub_contractor.trade} · ` : ''}{item.project?.name ?? '—'}
          </Text>
        </View>
        <Text style={styles.cardAmt}>{fmt(item.amount, item.project?.currency)}</Text>
      </View>
      {item.note ? <Text style={styles.cardNote}>{item.note}</Text> : null}
      <Text style={styles.metaText}>Requested by {item.requester?.full_name ?? '—'} · {new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: RED + '18', borderColor: RED + '55' }]}
          onPress={() => confirmDecision(item, 'rejected')}
          disabled={actingId === item.id}
        >
          {actingId === item.id ? <ActivityIndicator color={RED} size="small" /> : <Text style={{ color: RED, fontWeight: '700' }}>✕ Reject</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: GREEN }]}
          onPress={() => confirmDecision(item, 'approved')}
          disabled={actingId === item.id}
        >
          {actingId === item.id ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>✓ Approve</Text>}
        </TouchableOpacity>
      </View>
    </View>
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
          <Text style={styles.headerEyebrow}>GEOBASE · APPROVALS</Text>
          <Text style={styles.headerTitle}>Payment Requests</Text>
        </View>
      </View>

      {requests.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyText}>No pending payment requests</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onRefresh={load}
          refreshing={loading}
        />
      )}
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
  emptyText: { color: MUTED, fontSize: 15 },
  card: { backgroundColor: MID, borderWidth: 1, borderColor: GOLD + '33', borderRadius: 14, padding: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: WHITE },
  cardSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  cardAmt: { fontSize: 16, fontWeight: '800', color: GOLD },
  cardNote: { fontSize: 12, color: WHITE, marginBottom: 8, lineHeight: 18 },
  metaText: { fontSize: 11, color: MUTED, marginBottom: 12 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
})