import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, SafeAreaView, Modal, ScrollView,
  TextInput, Alert,
} from 'react-native'
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

type RequestDetail = {
  id: string
  title: string
  description: string
  request_type: string
  priority: string
  status: string
  created_at: string
  requested_by: string
  recipient_id: string
  sender_name?: string
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<RequestDetail | null>(null)
  const [responseMessage, setResponseMessage] = useState('')
  const [actionType, setActionType] = useState<'approved' | 'rejected' | null>(null)
  const [acting, setActing] = useState(false)

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

  const openNotification = async (notif: Notification) => {
    // Mark as read
    if (!notif.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id)
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
    }

    // Find the related request
    const { data: requests } = await supabase
      .from('requests')
      .select('*')
      .eq('requested_by', notif.requested_by)
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (requests && requests.length > 0) {
      const req = requests[0]
      // Get sender name
      const { data: sender } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', req.requested_by)
        .single()
      setSelectedRequest({ ...req, sender_name: sender?.full_name ?? '—' })
    } else {
      Alert.alert('Info', 'Could not find the related request.')
    }
  }

  const markAllRead = async () => {
    if (!userId) return
    await supabase.from('notifications').update({ is_read: true })
      .eq('recipient_id', userId).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const handleAction = async () => {
    if (!selectedRequest || !actionType) return
    if (!responseMessage.trim()) {
      Alert.alert('Required', 'Please enter a response message')
      return
    }
    try {
      setActing(true)
      await supabase.from('requests')
        .update({ status: actionType, response_message: responseMessage.trim() })
        .eq('id', selectedRequest.id)

      // Notify the sender
      await supabase.from('notifications').insert({
        title: `Request ${actionType.charAt(0).toUpperCase() + actionType.slice(1)}`,
        message: `Your request "${selectedRequest.title}" has been ${actionType}. ${responseMessage.trim()}`,
        recipient_id: selectedRequest.requested_by,
        requested_by: userId,
        is_read: false,
      })

      setSelectedRequest(null)
      setResponseMessage('')
      setActionType(null)
      await loadData()
      Alert.alert('Done', `Request has been ${actionType}.`)
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to update request')
    } finally {
      setActing(false)
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  const renderItem = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.card, !item.is_read && styles.cardUnread]}
      onPress={() => openNotification(item)}
    >
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
  )

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && <Text style={styles.unreadLabel}>{unreadCount} unread</Text>}
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
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

      {/* Request Detail Modal */}
      <Modal visible={!!selectedRequest} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{selectedRequest?.title}</Text>
                <TouchableOpacity onPress={() => { setSelectedRequest(null); setResponseMessage(''); setActionType(null) }}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.statusBadge, {
                backgroundColor: selectedRequest?.status === 'pending' ? '#c9a84c22' :
                  selectedRequest?.status === 'approved' ? '#4caf8222' : '#e05c5c22',
                borderColor: selectedRequest?.status === 'pending' ? '#c9a84c' :
                  selectedRequest?.status === 'approved' ? '#4caf82' : '#e05c5c',
              }]}>
                <Text style={[styles.statusText, {
                  color: selectedRequest?.status === 'pending' ? '#c9a84c' :
                    selectedRequest?.status === 'approved' ? '#4caf82' : '#e05c5c'
                }]}>{selectedRequest?.status?.toUpperCase()}</Text>
              </View>

              <Text style={styles.label}>From</Text>
              <Text style={styles.value}>{selectedRequest?.sender_name}</Text>

              <Text style={styles.label}>Type</Text>
              <Text style={styles.value}>{selectedRequest?.request_type}</Text>

              <Text style={styles.label}>Priority</Text>
              <Text style={styles.value}>{selectedRequest?.priority}</Text>

              <Text style={styles.label}>Description</Text>
              <Text style={styles.value}>{selectedRequest?.description}</Text>

              <Text style={styles.label}>Date</Text>
              <Text style={styles.value}>
                {selectedRequest ? new Date(selectedRequest.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric'
                }) : ''}
              </Text>

              {/* Approve/Reject — only for pending requests */}
              {selectedRequest?.status === 'pending' && (
                <View style={styles.actionSection}>
                  <Text style={styles.label}>Response Message</Text>
                  <TextInput
                    style={styles.responseInput}
                    placeholder="Add a response message..."
                    placeholderTextColor="#4a7a54"
                    value={responseMessage}
                    onChangeText={setResponseMessage}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                  <View style={styles.actionBtns}>
                    <TouchableOpacity
                      style={[styles.approveBtn, acting && { opacity: 0.6 }]}
                      onPress={() => { setActionType('approved'); handleAction() }}
                      disabled={acting}
                    >
                      {acting && actionType === 'approved'
                        ? <ActivityIndicator color="#0d2818" />
                        : <Text style={styles.approveBtnText}>✓ Approve</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rejectBtn, acting && { opacity: 0.6 }]}
                      onPress={() => { setActionType('rejected'); handleAction() }}
                      disabled={acting}
                    >
                      {acting && actionType === 'rejected'
                        ? <ActivityIndicator color="#ffffff" />
                        : <Text style={styles.rejectBtnText}>✕ Reject</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#4a7a54', fontSize: 16 },
  card: { backgroundColor: '#102e1a', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1e4d2b', flexDirection: 'row', gap: 12 },
  cardUnread: { borderColor: '#c9a84c33', backgroundColor: '#1a3d22' },
  cardLeft: { paddingTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#8faa8f', marginBottom: 4 },
  cardTitleUnread: { color: '#ffffff' },
  cardMessage: { fontSize: 13, color: '#6b8f71', lineHeight: 18, marginBottom: 6 },
  cardTime: { fontSize: 11, color: '#4a7a54' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#102e1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 48, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', flex: 1, marginRight: 8 },
  closeBtn: { fontSize: 18, color: '#6b8f71', padding: 4 },
  statusBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 20 },
  statusText: { fontSize: 12, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: '#c9a84c', marginBottom: 6 },
  value: { fontSize: 15, color: '#ffffff', marginBottom: 16, lineHeight: 22 },
  actionSection: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#1e4d2b', paddingTop: 16 },
  responseInput: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, padding: 12, fontSize: 14, color: '#ffffff', marginBottom: 16, minHeight: 80 },
  actionBtns: { flexDirection: 'row', gap: 12 },
  approveBtn: { flex: 1, backgroundColor: '#4caf82', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  approveBtnText: { color: '#0d2818', fontWeight: '700', fontSize: 15 },
  rejectBtn: { flex: 1, backgroundColor: '#e05c5c', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  rejectBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
})