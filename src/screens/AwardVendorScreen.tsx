import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, SafeAreaView, Modal, Alert, FlatList, ScrollView,
} from 'react-native'
import { supabase } from '../lib/supabase'

const GOLD  = '#c9a84c'
const DARK  = '#0a1209'
const MID   = '#152019'
const BORD  = '#1e3320'
const MUTED = '#8a9e8d'
const WHITE = '#e8e0d0'
const GREEN = '#4caf50'
const PURPLE = '#c084fc'

function fmt(n: number) {
  return `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: color + '22', borderWidth: 1, borderColor: color + '44' }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color }}>{label}</Text>
    </View>
  )
}

function statusColor(s: string) {
  switch (s) {
    case 'awarded':   return GREEN
    case 'cancelled': return '#ef5350'
    default:          return GOLD
  }
}

export default function AwardVendorScreen({ navigation }: any) {
  const [loading,   setLoading]   = useState(true)
  const [profile,   setProfile]   = useState<any>(null)
  const [items,     setItems]     = useState<any[]>([])
  const [proformas, setProformas] = useState<any[]>([])
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [awardingId, setAwardingId] = useState<string | null>(null)

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

      const [i, pf] = await Promise.all([
        supabase.from('procurement_items')
          .select('*, project:projects!project_id(name)')
          .order('created_at', { ascending: false }),
        supabase.from('procurement_proformas')
          .select('*, items:procurement_proforma_items(*, procurement_item:procurement_items(title))')
          .eq('organization_id', prof.organization_id)
          .order('created_at', { ascending: false }),
      ])
      setItems(i.data ?? [])
      setProformas(pf.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  const allLineItems = proformas.flatMap((pf: any) =>
    (pf.items ?? []).map((li: any) => ({ ...li, proforma: pf }))
  )

  const quotesForSelected = selectedItem
    ? allLineItems.filter(l => l.procurement_item_id === selectedItem.id)
    : []

  const handleAward = async (line: any) => {
    if (!selectedItem) return
    setAwardingId(line.id)
    try {
      const siblingIds = allLineItems.filter(l => l.procurement_item_id === selectedItem.id).map(l => l.id)
      await supabase.from('procurement_proforma_items').update({ is_awarded: false }).in('id', siblingIds)
      await supabase.from('procurement_proforma_items').update({ is_awarded: true }).eq('id', line.id)
      await supabase.from('procurement_items').update({ status: 'awarded' }).eq('id', selectedItem.id)

      try {
        const { data: approvers } = await supabase
          .from('profiles')
          .select('id, role:roles!role_id(name)')
          .eq('organization_id', profile.organization_id)
        const recipients = (approvers ?? [])
          .filter((p: any) => ['CEO', 'Finance Director', 'Admin'].includes(p.role?.name))
          .map((p: any) => p.id)
        if (recipients.length > 0) {
          await supabase.from('notifications').insert(
            recipients.map((rid: string) => ({
              recipient_id: rid,
              title: 'Procurement Decision Made',
              message: `"${selectedItem.title}" was awarded to ${line.proforma.vendor_name} for ${fmt(line.total_amount)}.`,
              is_read: false,
              requested_by: profile.id,
            }))
          )
        }
      } catch (notifErr) {
        console.error('[Award notification error]', notifErr)
      }

      Alert.alert('Success', `Awarded to ${line.proforma.vendor_name}.`)
      setSelectedItem(null)
      await load()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setAwardingId(null)
    }
  }

  const renderItem = ({ item }: { item: any }) => {
    const quoteCount = allLineItems.filter(l => l.procurement_item_id === item.id).length
    return (
      <TouchableOpacity style={styles.card} onPress={() => setSelectedItem(item)}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSub}>{item.category} · {item.quantity} {item.unit} · {item.project?.name ?? '—'}</Text>
          </View>
          <Badge label={item.status} color={statusColor(item.status)} />
        </View>
        <Text style={styles.quoteCount}>{quoteCount} quote{quoteCount !== 1 ? 's' : ''}</Text>
      </TouchableOpacity>
    )
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
          <Text style={styles.headerEyebrow}>GEOBASE · PROCUREMENT</Text>
          <Text style={styles.headerTitle}>Award Vendor</Text>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={styles.emptyText}>No procurement items yet.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onRefresh={load}
          refreshing={loading}
        />
      )}

      {/* Quotes modal */}
      <Modal visible={!!selectedItem} animationType="slide" transparent onRequestClose={() => setSelectedItem(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{selectedItem?.title}</Text>
            <Text style={{ color: MUTED, fontSize: 12, marginBottom: 16 }}>Select a vendor to award</Text>

            <ScrollView style={{ maxHeight: '75%' }}>
              {quotesForSelected.length === 0 ? (
                <Text style={styles.emptyText}>No quotes for this item yet.</Text>
              ) : quotesForSelected.map(line => {
                const verdictColor = line.ai_verdict === 'Recommended' ? GREEN : line.ai_verdict === 'Overpriced' ? '#ef5350' : line.ai_verdict === 'Suspiciously Low' ? '#ef8c35' : GOLD
                return (
                  <View key={line.id} style={[styles.quoteCard, line.is_awarded && { borderColor: GREEN + '66' }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.quoteVendor}>{line.proforma.vendor_name}</Text>
                        {line.is_awarded && <Badge label="AWARDED" color={GREEN} />}
                      </View>
                      <Text style={styles.quoteAmt}>{fmt(line.total_amount)}</Text>
                    </View>
                    <Text style={styles.quoteMeta}>Qty {line.quantity} · {line.delivery_days}d delivery</Text>
                    {line.ai_vetted && (
                      <Text style={[styles.quoteMeta, { color: verdictColor, fontWeight: '700', marginTop: 4 }]}>
                        {line.vetted_by === 'human' ? 'Human' : 'AI'} Score: {line.ai_score}/100 · {line.ai_verdict}
                      </Text>
                    )}
                    {!line.is_awarded && (
                      <TouchableOpacity
                        style={[styles.awardBtn, awardingId === line.id && { opacity: 0.6 }]}
                        onPress={() => handleAward(line)}
                        disabled={awardingId === line.id}
                      >
                        {awardingId === line.id
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.awardBtnText}>Award This Vendor</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                )
              })}
            </ScrollView>

            <TouchableOpacity style={styles.closeBar} onPress={() => setSelectedItem(null)}>
              <Text style={styles.closeBarText}>Close</Text>
            </TouchableOpacity>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: MUTED, fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  card: { backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 14, padding: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: WHITE },
  cardSub: { fontSize: 12, color: MUTED, marginTop: 3 },
  quoteCount: { fontSize: 11, color: MUTED },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: MID, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: WHITE },
  quoteCard: { backgroundColor: DARK, borderRadius: 12, borderWidth: 1, borderColor: BORD, padding: 14, marginBottom: 10 },
  quoteVendor: { fontSize: 14, fontWeight: '700', color: WHITE, marginBottom: 4 },
  quoteAmt: { fontSize: 15, fontWeight: '800', color: GOLD },
  quoteMeta: { fontSize: 11, color: MUTED },
  awardBtn: { marginTop: 10, backgroundColor: GREEN, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  awardBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  closeBar: { marginTop: 12, backgroundColor: BORD, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  closeBarText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
})