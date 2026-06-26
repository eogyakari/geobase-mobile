import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'

type Notification = {
  id: string
  title: string
  message: string
  is_read: boolean
  created_at: string
  requested_by: string
  request_id?: string
}

export default function NotificationsScreen({ navigation, onChanged }: any) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
      setNotifications(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useFocusEffect(useCallback(() => { loadData() }, []))

  // Tapping a notification marks it read, then hands off to the real
  // request detail screen (approve/reject/assign/complete all live there —
  // see Engineering Manual 13.9 for why this screen used to duplicate that
  // logic, incompletely, and why that was removed).
  const openNotification = async (notif: Notification) => {
    if (!notif.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id)
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
      onChanged?.()
    }

    if (notif.request_id) {
      navigation.navigate('Requests', { openRequestId: notif.request_id })
    } else {
      Alert.alert('Info', 'This notification has no linked request.')
    }
  }

  const markAllRead = async () => {
    if (!userId) return
    await supabase.from('notifications').update({ is_read: true })
      .eq('recipient_id', userId).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    onChanged?.()
  }

  const handleDeleteOne = async (id: string) => {
    setDeletingId(id)
    try {
      const deleted = notifications.find(n => n.id === id)
      await supabase.from('notifications').delete().eq('id', id)
      setNotifications(prev => prev.filter(n => n.id !== id))
      if (deleted && !deleted.is_read) onChanged?.()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to delete notification')
    } finally {
      setDeletingId(null)
    }
  }

  const handleClearAll = () => {
    if (!userId || notifications.length === 0) return
    Alert.alert(
      'Clear all notifications?',
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setClearing(true)
            try {
              await supabase.from('notifications').delete().eq('recipient_id', userId)
              setNotifications([])
              onChanged?.()
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Failed to clear notifications')
            } finally {
              setClearing(false)
            }
          },
        },
      ]
    )
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  const renderItem = ({ item }: { item: Notification }) => (
    <View style={[styles.card, !item.is_read && styles.cardUnread]}>
      <TouchableOpacity style={styles.cardMain} onPress={() => openNotification(item)}>
        <View style={styles.cardLeft}>
          <View style={[styles.dot, { backgroundColor: item.is_read ? '#1e4d2b' : '#c9a84c' }]} />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, !item.is_read && styles.cardTitleUnread]}>
            {item.title}
          </Text>
          <Text style={styles.cardMessage} numberOfLines={2}>{item.message}</Text>
          <Text style={styles.cardTime}>
            {new Date(item.created_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDeleteOne(item.id)}
        disabled={deletingId === item.id}
      >
        {deletingId === item.id
          ? <ActivityIndicator color="#6b8f71" size="small" />
          : <Text style={styles.deleteBtnText}>✕</Text>}
      </TouchableOpacity>
    </View>
  )

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && <Text style={styles.unreadLabel}>{unreadCount} unread</Text>}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
              <Text style={styles.markAllText}>Mark all read</Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity style={styles.clearAllBtn} onPress={handleClearAll} disabled={clearing}>
              {clearing
                ? <ActivityIndicator color="#e05c5c" size="small" />
                : <Text style={styles.clearAllText}>Clear all</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#c9a84c" size="large" /></View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🔔</Text>
          <Text style={styles.emptyText}>No notifications yet</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          onRefresh={loadData}
          refreshing={loading}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0d2818' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#ffffff' },
  unreadLabel: { fontSize: 12, color: '#c9a84c', marginTop: 2 },
  markAllBtn: { borderWidth: 1, borderColor: '#c9a84c', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  markAllText: { color: '#c9a84c', fontSize: 12, fontWeight: '600' },
  clearAllBtn: { borderWidth: 1, borderColor: '#e05c5c', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, justifyContent: 'center' },
  clearAllText: { color: '#e05c5c', fontSize: 12, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#4a7a54', fontSize: 16 },
  card: {
    backgroundColor: '#102e1a', borderRadius: 12, borderWidth: 1, borderColor: '#1e4d2b',
    flexDirection: 'row', alignItems: 'center',
  },
  cardUnread: { borderColor: '#c9a84c33', backgroundColor: '#1a3d22' },
  cardMain: { flex: 1, flexDirection: 'row', gap: 12, padding: 14 },
  cardLeft: { paddingTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#8faa8f', marginBottom: 4 },
  cardTitleUnread: { color: '#ffffff' },
  cardMessage: { fontSize: 13, color: '#6b8f71', lineHeight: 18, marginBottom: 6 },
  cardTime: { fontSize: 11, color: '#4a7a54' },
  deleteBtn: { paddingHorizontal: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { color: '#6b8f71', fontSize: 16, fontWeight: '700' },
})