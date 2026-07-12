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

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: color + '22', borderWidth: 1, borderColor: color + '44' }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color }}>{label}</Text>
    </View>
  )
}

function initials(name = '') {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function UserManagementScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [users,   setUsers]   = useState<any[]>([])
  const [filter,  setFilter]  = useState<'all' | 'active' | 'inactive'>('all')
  const [actingId, setActingId] = useState<string | null>(null)

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

      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email, staff_id, is_active, role:roles!role_id(name)')
        .eq('organization_id', prof.organization_id)
        .order('full_name')
      setUsers(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  const toggleActive = (u: any) => {
    if (u.id === profile?.id) {
      Alert.alert('Not Allowed', 'You cannot deactivate your own account.')
      return
    }
    const willActivate = u.is_active === false
    Alert.alert(
      willActivate ? 'Reactivate User?' : 'Deactivate User?',
      willActivate
        ? `${u.full_name} will be able to sign in again.`
        : `${u.full_name} will be immediately unable to sign in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: willActivate ? 'Reactivate' : 'Deactivate',
          style: willActivate ? 'default' : 'destructive',
          onPress: async () => {
            setActingId(u.id)
            try {
              const { error } = await supabase.from('profiles').update({ is_active: willActivate }).eq('id', u.id)
              if (error) throw error
              setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: willActivate } : x))
            } catch (e: any) {
              Alert.alert('Error', e.message)
            } finally {
              setActingId(null)
            }
          },
        },
      ]
    )
  }

  const filtered = users.filter(u => {
    if (filter === 'active') return u.is_active !== false
    if (filter === 'inactive') return u.is_active === false
    return true
  })

  const activeCount = users.filter(u => u.is_active !== false).length
  const inactiveCount = users.filter(u => u.is_active === false).length

  const renderItem = ({ item }: { item: any }) => {
    const isActive = item.is_active !== false
    return (
      <View style={[styles.card, !isActive && { opacity: 0.6 }]}>
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(item.full_name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.full_name}</Text>
            <Text style={styles.cardSub}>{item.email}</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              <Badge label={item.role?.name ?? '—'} color={GOLD} />
              <Badge label={isActive ? 'Active' : 'Inactive'} color={isActive ? GREEN : RED} />
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.toggleBtn, isActive ? { borderColor: RED + '55', backgroundColor: RED + '18' } : { borderColor: GREEN + '55', backgroundColor: GREEN + '18' }]}
          onPress={() => toggleActive(item)}
          disabled={actingId === item.id}
        >
          {actingId === item.id
            ? <ActivityIndicator color={isActive ? RED : GREEN} size="small" />
            : <Text style={{ color: isActive ? RED : GREEN, fontWeight: '700', fontSize: 13 }}>{isActive ? 'Deactivate' : 'Reactivate'}</Text>}
        </TouchableOpacity>
      </View>
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
          <Text style={styles.headerEyebrow}>GEOBASE · CEO</Text>
          <Text style={styles.headerTitle}>User Management</Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        {([
          { key: 'all', label: `All (${users.length})` },
          { key: 'active', label: `Active (${activeCount})` },
          { key: 'inactive', label: `Inactive (${inactiveCount})` },
        ] as const).map(f => (
          <TouchableOpacity key={f.key} style={[styles.filterTab, filter === f.key && styles.filterTabActive]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>No users found.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
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
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORD },
  filterTabActive: { backgroundColor: GOLD, borderColor: GOLD },
  filterText: { fontSize: 11, color: MUTED, fontWeight: '600' },
  filterTextActive: { color: DARK },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: MUTED, fontSize: 15 },
  card: { backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 14, padding: 16 },
  cardTop: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: DARK, fontWeight: '800', fontSize: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: WHITE },
  cardSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  toggleBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
})