import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Alert, Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { supabase } from '../lib/supabase'
import { ATTACHMENT_REQUIRED_TYPES, getAssigneePool, getRecipientPool, canRoleComplete } from '../shared/requestRules'

type Request = {
  id: string
  title: string
  description: string
  request_type: string
  priority: string
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  created_at: string
  requested_by: string
  recipient_id: string
  assigned_to?: string
  completed_at?: string
  completed_by?: string
  completion_notes?: string
  response_attachment_url?: string
  sender_name?: string
  recipient_name?: string
  assignee_name?: string
  completed_by_name?: string
}


type Profile = {
  id: string
  full_name: string
  organization_id: string
  role_name?: string
}

const STATUS_COLOR: Record<string, string> = {
  pending: '#c9a84c',
  approved: '#4caf82',
  completed: '#64b5f6',
  rejected: '#e05c5c',
}

const PRIORITY_COLOR: Record<string, string> = {
  Low: '#4caf82',
  Medium: '#c9a84c',
  High: '#e08c3c',
  Critical: '#e05c5c',
}

// Mobile stores short request_type values ('Leave', 'Petty Cash', 'Material') while
// shared/requestRules.ts (and web) key on the full names ('Leave Request', etc).
// Translate here at the call site only — this does not change what's stored or displayed.
const MOBILE_TO_SHARED_TYPE: Record<string, string> = {
  Leave: 'Leave Request',
  'Petty Cash': 'Petty Cash Request',
  Material: 'Material Request',
}
function toSharedType(requestType: string) {
  return MOBILE_TO_SHARED_TYPE[requestType] ?? requestType
}

function buildRequestExtras(requestType: string, s: { leaveFrom: string; leaveTo: string; amount: string; pettyCashProjectId: string; pettyCashPurpose: string }) {
  let start_date: string | null = null
  let end_date: string | null = null
  let amount: number | null = null
  let details: Record<string, any> | null = null

  if (requestType === 'Leave') {
    start_date = s.leaveFrom || null
    end_date = s.leaveTo || null
  } else if (requestType === 'Petty Cash') {
    amount = s.amount ? Number(s.amount) : null
    details = { projectId: s.pettyCashProjectId || null, purpose: s.pettyCashPurpose || null }
  }

  return { start_date, end_date, amount, details }
}

export default function RequestsScreen({ route, navigation }: any) {
  const [tab, setTab] = useState<'mine' | 'inbox' | 'complete'>('mine')
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'completed' | 'rejected'>('all')
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [modalVisible, setModalVisible] = useState(false)
  const [detailRequest, setDetailRequest] = useState<Request | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [orgProfiles, setOrgProfiles] = useState<Profile[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [pettyCashProjectId, setPettyCashProjectId] = useState('')
  const [pettyCashPurpose, setPettyCashPurpose] = useState('')
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [requestType, setRequestType] = useState('General')
  const [priority, setPriority] = useState('Medium')
  const [recipientId, setRecipientId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showRecipientPicker, setShowRecipientPicker] = useState(false)
  const [responseMsg, setResponseMsg] = useState('')
  const [leaveFrom, setLeaveFrom] = useState('')
  const [leaveTo, setLeaveTo] = useState('')
  const [amount, setAmount] = useState('')
  const [completionMode, setCompletionMode] = useState<'self' | 'assign'>('self')
  const [assigneeId, setAssigneeId] = useState('')
  const [showAssigneePicker, setShowAssigneePicker] = useState(false)
  const [completionNotes, setCompletionNotes] = useState('')
  const [completing, setCompleting] = useState(false)
  const [completionFile, setCompletionFile] = useState<{ uri: string; name: string; mimeType: string } | null>(null)
  const [uploadingCompletionFile, setUploadingCompletionFile] = useState(false)
  const [showAttachOptions, setShowAttachOptions] = useState(false)


  const loadData = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase
        .from('profiles')
        .select('*, roles(name)')
        .eq('id', user.id)
        .single()
      const myProfile = { ...prof, role_name: prof?.roles?.name ?? '' }
      setProfile(myProfile)

      const { data: profileList } = await supabase
        .from('profiles')
        .select('id, full_name, organization_id, roles(name)')
        .eq('organization_id', myProfile.organization_id)
        .neq('id', user.id)
      setOrgProfiles((profileList ?? []).map((p: any) => ({ ...p, role_name: p.roles?.name ?? '' })))

      const { data: projectList } = await supabase
        .from('projects')
        .select('id, name')
        .eq('organization_id', myProfile.organization_id)
        .order('name')
      setProjects(projectList ?? [])

      const { data: reqData } = await supabase
        .from('requests')
        .select('*')
        .eq('organization_id', myProfile.organization_id)
        .order('created_at', { ascending: false })

      if (reqData && reqData.length > 0) {
        const ids = [...new Set([
          ...reqData.map((r: any) => r.requested_by).filter(Boolean),
          ...reqData.map((r: any) => r.recipient_id).filter(Boolean),
          ...reqData.map((r: any) => r.assigned_to).filter(Boolean),
          ...reqData.map((r: any) => r.completed_by).filter(Boolean),
        ])]
        const { data: names } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids)
        const nameMap: Record<string, string> = {}
        names?.forEach((p: any) => { nameMap[p.id] = p.full_name })
        setRequests(reqData.map((r: any) => ({
          ...r,
          sender_name: nameMap[r.requested_by] ?? '—',
          recipient_name: nameMap[r.recipient_id] ?? '—',
          assignee_name: r.assigned_to ? (nameMap[r.assigned_to] ?? '—') : undefined,
          completed_by_name: r.completed_by ? (nameMap[r.completed_by] ?? '—') : undefined,
        })))
      } else {
        setRequests([])
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  useFocusEffect(useCallback(() => { loadData() }, []))

  const resetForm = () => {
    setTitle(''); setDescription(''); setRequestType('General')
    setPriority('Medium'); setRecipientId(''); setShowRecipientPicker(false)
    setLeaveFrom(''); setLeaveTo(''); setAmount('')
    setPettyCashProjectId(''); setPettyCashPurpose(''); setShowProjectPicker(false)
  }

  const submitRequest = async () => {
    if (!title.trim()) return Alert.alert('Required', 'Please enter a title')
    if (!description.trim()) return Alert.alert('Required', 'Please enter a description')
    if (!recipientId) return Alert.alert('Required', 'Please select a recipient')
    if (requestType === 'Leave' && (!leaveFrom || !leaveTo)) {
      return Alert.alert('Required', 'Please enter both start and end dates')
    }
    if (requestType === 'Petty Cash' && (!pettyCashProjectId || !pettyCashPurpose.trim())) {
      return Alert.alert('Required', 'Please select a project and enter a purpose')
    }
    try {
      setSubmitting(true)
      const { data: { user } } = await supabase.auth.getUser()

      const extras = buildRequestExtras(requestType, { leaveFrom, leaveTo, amount, pettyCashProjectId, pettyCashPurpose })

      const { data: newRequest, error } = await supabase
        .from('requests')
        .insert({
          title: title.trim(),
          description: description.trim(),
          request_type: requestType,
          amount: extras.amount,
          start_date: extras.start_date,
          end_date: extras.end_date,
          details: extras.details,
          priority,
          status: 'pending',
          requested_by: user!.id,
          recipient_id: recipientId,
          organization_id: profile!.organization_id,
        })
        .select()
        .single()

      if (error) throw error

      await supabase.from('notifications').insert({
        title: 'New Request',
        message: `${profile!.full_name ?? 'Someone'} sent you a request: "${title.trim()}"`,
        recipient_id: recipientId,
        requested_by: user!.id,
        request_id: newRequest?.id,
        is_read: false,
      })

      resetForm()
      setModalVisible(false)
      await loadData()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }


 const handleReject = async () => {
    if (!detailRequest) return
    try {
      const nowIso = new Date().toISOString()
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('requests').update({
        status: 'rejected',
        response_message: responseMsg.trim(),
        rejected_at: nowIso,
        responded_at: nowIso,
      }).eq('id', detailRequest.id)

      if (error) throw error

      await supabase.from('notifications').insert({
        recipient_id: detailRequest.requested_by,
        title: 'Request Rejected',
        message: `Your request "${detailRequest.title}" has been rejected.`,
        is_read: false, requested_by: user!.id, request_id: detailRequest.id,
      })

      setDetailRequest(null)
      setResponseMsg('')
      await loadData()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to reject request')
    }
  }

  const handleApprove = async () => {
    if (!detailRequest) return
    const canSelfComplete = canRoleComplete(toSharedType(detailRequest.request_type), profile?.role_name)
    const finalMode = canSelfComplete ? completionMode : 'assign'
    if (finalMode === 'assign' && !assigneeId) {
      Alert.alert('Required', 'Please select someone to complete this request')
      return
    }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const finalAssignee = finalMode === 'self' ? user!.id : assigneeId
      const nowIso = new Date().toISOString()

      const { error } = await supabase.from('requests').update({
        status: 'approved',
        response_message: responseMsg.trim(),
        approved_by: user!.id,
        approved_at: nowIso,
        responded_at: nowIso,
        assigned_to: finalAssignee,
      }).eq('id', detailRequest.id)

      if (error) throw error

      const notifications = [{
        recipient_id: detailRequest.requested_by,
        title: 'Request Approved',
        message: `Your request "${detailRequest.title}" has been approved.`,
        is_read: false, requested_by: user!.id, request_id: detailRequest.id,
      }]

      if (finalAssignee !== user!.id) {
        notifications.push({
          recipient_id: finalAssignee,
          title: 'Request Assigned to You',
          message: `You've been assigned to complete: "${detailRequest.title}"`,
          is_read: false, requested_by: user!.id, request_id: detailRequest.id,
        })
      }

      await supabase.from('notifications').insert(notifications)

      setDetailRequest(null)
      setResponseMsg('')
      setCompletionMode('self')
      setAssigneeId('')
      await loadData()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to approve request')
    }
  }

  const pickCompletionPhoto = async () => {
    setShowAttachOptions(false)
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 0.7,
    })

    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    const ext = asset.uri.split('.').pop() ?? 'jpg'
    setCompletionFile({
      uri: asset.uri,
      name: `photo-${Date.now()}.${ext}`,
      mimeType: asset.mimeType ?? `image/${ext}`,
    })
  }

  const pickCompletionDocument = async () => {
    setShowAttachOptions(false)
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/*'],
      copyToCacheDirectory: true,
    })

    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    setCompletionFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
    })
  }

  const handleComplete = async () => {
    if (!detailRequest) return
    const attachmentRequired = ATTACHMENT_REQUIRED_TYPES.has(toSharedType(detailRequest.request_type))

    if (attachmentRequired && !completionFile) {
      Alert.alert('Attachment Required', `${detailRequest.request_type} requests require a document before marking as completed.`)
      return
    }

    setCompleting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      let attachmentUrl: string | null = null

      if (completionFile) {
        setUploadingCompletionFile(true)
        const ext = completionFile.name.split('.').pop() ?? 'dat'
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const formData = new FormData()
        formData.append('file', {
          uri: completionFile.uri,
          name: fileName,
          type: completionFile.mimeType,
        } as any)

        const { data, error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(`completions/${fileName}`, formData, { contentType: 'multipart/form-data' })

        setUploadingCompletionFile(false)

        if (uploadError) throw uploadError
        if (data) {
          const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(data.path)
          attachmentUrl = urlData.publicUrl
        }
      }

      const nowIso = new Date().toISOString()
      const { error } = await supabase.from('requests').update({
        status: 'completed',
        completed_by: user!.id,
        completed_at: nowIso,
        completion_notes: completionNotes.trim() || null,
        response_attachment_url: attachmentUrl,
      }).eq('id', detailRequest.id)

      if (error) throw error

      const recipients = [...new Set([detailRequest.requested_by, detailRequest.recipient_id])]
        .filter(id => id && id !== user!.id)

      if (recipients.length > 0) {
        await supabase.from('notifications').insert(
          recipients.map(rid => ({
            recipient_id: rid,
            title: 'Request Completed',
            message: `"${detailRequest.title}" has been marked as completed.`,
            is_read: false, requested_by: user!.id, request_id: detailRequest.id,
          }))
        )
      }

      setDetailRequest(null)
      setCompletionNotes('')
      setCompletionFile(null)
      await loadData()
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to mark as completed')
    } finally {
      setCompleting(false)
    }
  }

  useEffect(() => {
    const targetId = route?.params?.openRequestId
    if (!targetId) return
    const found = requests.find(r => r.id === targetId)
    if (found) {
      setDetailRequest(found)
      navigation.setParams({ openRequestId: undefined })
    }
  }, [route?.params?.openRequestId, requests])

  const myRequests = requests.filter(r => r.requested_by === profile?.id)
  const inbox = requests.filter(r => r.recipient_id === profile?.id)
  const toCompleteList = requests.filter((r: any) =>
    r.assigned_to === profile?.id && r.status === 'approved' && !r.completed_at
  )
  // shared/requestRules.ts's getAssigneePool expects web's profile shape (role.name);
  // mobile's Profile carries role_name flat — adapt once here, not in the shared file.

  const assigneePoolSource = orgProfiles.map(p => ({ ...p, role: { name: p.role_name } }))
  const activeList = tab === 'mine' ? myRequests : tab === 'inbox' ? inbox : toCompleteList
  const filtered = filter === 'all' ? activeList : activeList.filter(r => r.status === filter)
  const pendingCount = activeList.filter(r => r.status === 'pending').length
  const approvedCount = activeList.filter(r => r.status === 'approved').length
  const completedCount = activeList.filter(r => r.status === 'completed').length
  const rejectedCount = activeList.filter(r => r.status === 'rejected').length
  const selectedRecipient = orgProfiles.find(p => p.id === recipientId)
  const completedAttachmentUrl = detailRequest?.response_attachment_url

  const renderItem = ({ item }: { item: Request }) => (
    <TouchableOpacity style={styles.card} onPress={() => setDetailRequest(item)}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardType}>{item.request_type}</Text>
        </View>
        <View style={[styles.badge, { borderColor: STATUS_COLOR[item.status], backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>
          {tab === 'mine' ? `To: ${item.recipient_name}` : tab === 'inbox' ? `From: ${item.sender_name}` : `From: ${item.sender_name}`}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[item.priority] ?? '#6b8f71' }]} />
          <Text style={styles.metaText}>{item.priority}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Requests</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'mine' && styles.tabBtnActive]} onPress={() => { setTab('mine'); setFilter('all') }}>
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>
            Mine {myRequests.length > 0 ? `(${myRequests.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'inbox' && styles.tabBtnActive]} onPress={() => { setTab('inbox'); setFilter('all') }}>
          <Text style={[styles.tabText, tab === 'inbox' && styles.tabTextActive]}>
            Inbox {inbox.filter(r => r.status === 'pending').length > 0 ? `(${inbox.filter(r => r.status === 'pending').length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'complete' && styles.tabBtnActive]} onPress={() => { setTab('complete'); setFilter('all') }}>
          <Text style={[styles.tabText, tab === 'complete' && styles.tabTextActive]}>
            To Do {toCompleteList.length > 0 ? `(${toCompleteList.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <TouchableOpacity style={[styles.statCard, { borderTopColor: '#c9a84c' }, filter === 'pending' && styles.statCardActive]} onPress={() => setFilter(filter === 'pending' ? 'all' : 'pending')}>
          <Text style={styles.statNum}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.statCard, { borderTopColor: '#4caf82' }, filter === 'approved' && styles.statCardActive]} onPress={() => setFilter(filter === 'approved' ? 'all' : 'approved')}>
          <Text style={styles.statNum}>{approvedCount}</Text>
          <Text style={styles.statLabel}>Approved</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.statCard, { borderTopColor: '#64b5f6' }, filter === 'completed' && styles.statCardActive]} onPress={() => setFilter(filter === 'completed' ? 'all' : 'completed')}>
          <Text style={styles.statNum}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.statCard, { borderTopColor: '#e05c5c' }, filter === 'rejected' && styles.statCardActive]} onPress={() => setFilter(filter === 'rejected' ? 'all' : 'rejected')}>
          <Text style={styles.statNum}>{rejectedCount}</Text>
          <Text style={styles.statLabel}>Rejected</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'pending', 'approved', 'completed', 'rejected'] as const).map(f => (
          <TouchableOpacity key={f} style={[styles.filterTab, filter === f && styles.filterTabActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#c9a84c" size="large" /></View>
       ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>{tab === 'mine' ? '📋' : tab === 'inbox' ? '📥' : '✅'}</Text>
          <Text style={styles.emptyText}>
            {tab === 'mine' ? 'No requests sent' : tab === 'inbox' ? 'Your inbox is empty' : 'Nothing to complete'}
          </Text>
        </View>
      ) : (

        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onRefresh={loadData}
          refreshing={loading}
        />
      )}

{/* Detail Overlay */}
      {!!detailRequest && (
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalKav}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCard}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>{detailRequest?.title}</Text>

                <View style={styles.detailRow}>
                  <View style={[styles.badge, {
                    borderColor: STATUS_COLOR[detailRequest?.status ?? 'pending'],
                    backgroundColor: STATUS_COLOR[detailRequest?.status ?? 'pending'] + '22'
                  }]}>
                    <Text style={[styles.badgeText, { color: STATUS_COLOR[detailRequest?.status ?? 'pending'] }]}>
                      {detailRequest?.status?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLOR[detailRequest?.priority ?? 'Medium'] }]} />
                    <Text style={styles.metaText}>{detailRequest?.priority} Priority</Text>
                  </View>
                </View>

                <Text style={styles.label}>Type</Text>
                <Text style={styles.detailValue}>{detailRequest?.request_type}</Text>

                <Text style={styles.label}>
                  {detailRequest?.requested_by === profile?.id ? 'Sent To' : 'Sent By'}
                </Text>
                <Text style={styles.detailValue}>
                  {detailRequest?.requested_by === profile?.id
                    ? detailRequest?.recipient_name
                    : detailRequest?.sender_name}
                </Text>

                <Text style={styles.label}>Description</Text>
                <Text style={styles.detailValue}>{detailRequest?.description}</Text>

                <Text style={styles.label}>Date</Text>
                <Text style={styles.detailValue}>
                  {detailRequest ? new Date(detailRequest.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  }) : ''}
                </Text>

                {detailRequest?.status === 'completed' && (
                  <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#1e4d2b', paddingTop: 16 }}>
                    <Text style={styles.label}>Completed By</Text>
                    <Text style={styles.detailValue}>{detailRequest?.completed_by_name ?? '—'}</Text>

                    <Text style={styles.label}>Completed On</Text>
                    <Text style={styles.detailValue}>
                      {detailRequest?.completed_at ? new Date(detailRequest.completed_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'long', year: 'numeric'
                      }) : '—'}
                    </Text>

                    {detailRequest?.completion_notes && (
                      <>
                        <Text style={styles.label}>Completion Notes</Text>
                        <Text style={styles.detailValue}>{detailRequest.completion_notes}</Text>
                      </>
                    )}

                    {completedAttachmentUrl && (
                      <TouchableOpacity onPress={() => Linking.openURL(completedAttachmentUrl)}>
                        <Text style={{ color: '#c9a84c', fontWeight: '600', fontSize: 13, marginBottom: 4 }}>
                          📎 View Attachment
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {detailRequest?.recipient_id === profile?.id && detailRequest?.status === 'pending' && (
                  <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#1e4d2b', paddingTop: 16 }}>
                    <Text style={styles.label}>Response Message</Text>
                    <TextInput
                      style={[styles.input, { height: 80, marginBottom: 12 }]}
                      placeholder="Add a response message..."
                      placeholderTextColor="#4a7a54"
                      value={responseMsg}
                      onChangeText={setResponseMsg}
                      multiline
                      textAlignVertical="top"
                    />

                    <Text style={styles.label}>Who Will Complete This?</Text>
                    <View style={[styles.typeRow, { marginBottom: 12 }]}>
                      {canRoleComplete(toSharedType(detailRequest.request_type), profile?.role_name) && (
                        <TouchableOpacity
                          style={[styles.typeBtn, completionMode === 'self' && styles.typeBtnActive, { flex: 1 }]}
                          onPress={() => setCompletionMode('self')}
                        >
                          <Text style={[styles.typeBtnText, completionMode === 'self' && styles.typeBtnTextActive]}>I'll Do It</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[styles.typeBtn, completionMode === 'assign' && styles.typeBtnActive, { flex: 1 }]}
                        onPress={() => setCompletionMode('assign')}
                      >
                        <Text style={[styles.typeBtnText, completionMode === 'assign' && styles.typeBtnTextActive]}>Assign Someone</Text>
                      </TouchableOpacity>
                    </View>

                    {completionMode === 'assign' && (
                      <>
                        <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowAssigneePicker(!showAssigneePicker)}>
                          <Text style={assigneeId ? styles.recipientSelected : styles.recipientPlaceholder}>
                            {assigneeId
                              ? orgProfiles.find(p => p.id === assigneeId)?.full_name
                              : 'Select person...'}
                          </Text>
                          <Text style={styles.chevron}>{showAssigneePicker ? '▲' : '▼'}</Text>
                        </TouchableOpacity>
                        {showAssigneePicker && (
                          <View style={styles.recipientDropdown}>
                            {getAssigneePool(toSharedType(detailRequest.request_type), assigneePoolSource).map(p => (
                              <TouchableOpacity
                                key={p.id}
                                style={[styles.recipientOption, assigneeId === p.id && styles.recipientOptionActive]}
                                onPress={() => { setAssigneeId(p.id); setShowAssigneePicker(false) }}
                              >
                                <Text style={[styles.recipientOptionText, assigneeId === p.id && { color: '#0d2818' }]}>
                                  {p.full_name}{p.role_name ? ` (${p.role_name})` : ''}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </>
                    )}

                    <View style={[styles.actionRow, { marginTop: 12 }]}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: '#4caf82', flex: 1, justifyContent: 'center', backgroundColor: '#4caf8222' }]}
                        onPress={handleApprove}
                      >
                        <Text style={[styles.actionBtnText, { color: '#4caf82' }]}>✓ Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: '#e05c5c', flex: 1, justifyContent: 'center', backgroundColor: '#e05c5c22' }]}
                        onPress={handleReject}
                      >
                        <Text style={[styles.actionBtnText, { color: '#e05c5c' }]}>✕ Reject</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {detailRequest?.assigned_to === profile?.id &&
                  detailRequest?.status === 'approved' &&
                  !detailRequest?.completed_at && (
                  <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#1e4d2b', paddingTop: 16 }}>
                    <Text style={styles.label}>Completion Notes</Text>
                    <TextInput
                      style={[styles.input, { height: 80, marginBottom: 12 }]}
                      placeholder="Describe what was done..."
                      placeholderTextColor="#4a7a54"
                      value={completionNotes}
                      onChangeText={setCompletionNotes}
                      multiline
                      textAlignVertical="top"
                    />

                   <Text style={styles.label}>
                      Attach File {ATTACHMENT_REQUIRED_TYPES.has(toSharedType(detailRequest.request_type)) ? '(required)' : '(optional)'}
                    </Text>
                    <TouchableOpacity
                      style={[styles.recipientPicker, { marginBottom: 8 }]}
                      onPress={() => setShowAttachOptions(!showAttachOptions)}
                      disabled={uploadingCompletionFile}
                    >
                      <Text style={completionFile ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {completionFile ? completionFile.name : 'Tap to attach a file...'}
                      </Text>
                      <Text style={styles.chevron}>{showAttachOptions ? '▲' : '▼'}</Text>
                    </TouchableOpacity>

                    {showAttachOptions && (
                      <View style={[styles.recipientDropdown, { marginBottom: 12 }]}>
                        <TouchableOpacity style={styles.recipientOption} onPress={pickCompletionPhoto}>
                          <Text style={styles.recipientOptionText}>📷 Choose Photo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.recipientOption, { borderBottomWidth: 0 }]} onPress={pickCompletionDocument}>
                          <Text style={styles.recipientOptionText}>📄 Choose Document (PDF, Word)</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {completionFile && (
                      <TouchableOpacity onPress={() => setCompletionFile(null)} style={{ marginBottom: 12 }}>
                        <Text style={{ color: '#e05c5c', fontSize: 12, fontWeight: '600' }}>✕ Remove file</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[styles.submitBtn, (completing || uploadingCompletionFile) && { opacity: 0.6 }]}
                      onPress={handleComplete}
                      disabled={completing || uploadingCompletionFile}
                    >
                      {completing || uploadingCompletionFile
                        ? <ActivityIndicator color="#0d2818" />
                        : <Text style={styles.submitBtnText}>✓ Mark as Completed</Text>}
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.closeBar}
                  onPress={() => { setDetailRequest(null); setResponseMsg('') }}
                >
                  <Text style={styles.closeBarText}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* New Request Overlay */}
      {modalVisible && (
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            style={styles.modalKav}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCard}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>New Request</Text>
                <Text style={styles.label}>Recipient</Text>
                <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowRecipientPicker(!showRecipientPicker)}>
                  <Text style={selectedRecipient ? styles.recipientSelected : styles.recipientPlaceholder}>
                    {selectedRecipient ? selectedRecipient.full_name : 'Select recipient...'}
                  </Text>
                  <Text style={styles.chevron}>{showRecipientPicker ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {showRecipientPicker && (
                  <View style={styles.recipientDropdown}>
                    {getRecipientPool(toSharedType(requestType), orgProfiles.map(p => ({ ...p, role: { name: p.role_name } }))).map((p: any) => (
                      <TouchableOpacity key={p.id} style={[styles.recipientOption, recipientId === p.id && styles.recipientOptionActive]} onPress={() => { setRecipientId(p.id); setShowRecipientPicker(false) }}>
                        <Text style={[styles.recipientOptionText, recipientId === p.id && { color: '#0d2818' }]}>{p.full_name}{p.role_name ? ` (${p.role_name})` : ''}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={styles.typeRow}>
                  {['General', 'Leave', 'Petty Cash', 'Material'].map(t => (
                    <TouchableOpacity key={t} style={[styles.typeBtn, requestType === t && styles.typeBtnActive]} onPress={() => { setRequestType(t); setRecipientId('') }}>
                      <Text style={[styles.typeBtnText, requestType === t && styles.typeBtnTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {requestType === 'Leave' && (
                  <>
                    <Text style={styles.label}>Start Date</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#4a7a54"
                      value={leaveFrom}
                      onChangeText={setLeaveFrom}
                    />
                    <Text style={styles.label}>End Date</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#4a7a54"
                      value={leaveTo}
                      onChangeText={setLeaveTo}
                    />
                  </>
                )}

                {requestType === 'Petty Cash' && (
                  <>
                    <Text style={styles.label}>Project</Text>
                    <TouchableOpacity style={styles.recipientPicker} onPress={() => setShowProjectPicker(!showProjectPicker)}>
                      <Text style={pettyCashProjectId ? styles.recipientSelected : styles.recipientPlaceholder}>
                        {pettyCashProjectId
                          ? projects.find(p => p.id === pettyCashProjectId)?.name
                          : 'Select project...'}
                      </Text>
                      <Text style={styles.chevron}>{showProjectPicker ? '▲' : '▼'}</Text>
                    </TouchableOpacity>
                    {showProjectPicker && (
                      <View style={styles.recipientDropdown}>
                        {projects.map(p => (
                          <TouchableOpacity
                            key={p.id}
                            style={[styles.recipientOption, pettyCashProjectId === p.id && styles.recipientOptionActive]}
                            onPress={() => { setPettyCashProjectId(p.id); setShowProjectPicker(false) }}
                          >
                            <Text style={[styles.recipientOptionText, pettyCashProjectId === p.id && { color: '#0d2818' }]}>{p.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <Text style={styles.label}>Purpose</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. Site transport, minor tools"
                      placeholderTextColor="#4a7a54"
                      value={pettyCashPurpose}
                      onChangeText={setPettyCashPurpose}
                    />

                    <Text style={styles.label}>Amount (GHS)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0.00"
                      placeholderTextColor="#4a7a54"
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="numeric"
                    />
                  </>
                )}

                <Text style={styles.label}>Priority</Text>
                <View style={styles.typeRow}>
                  {['Low', 'Medium', 'High', 'Critical'].map(p => (
                    <TouchableOpacity key={p} style={[styles.typeBtn, priority === p && styles.typeBtnActive]} onPress={() => setPriority(p)}>
                      <Text style={[styles.typeBtnText, priority === p && styles.typeBtnTextActive]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Title</Text>
                <TextInput style={styles.input} placeholder="e.g. Equipment needed on site" placeholderTextColor="#4a7a54" value={title} onChangeText={setTitle} />
                <Text style={styles.label}>Description</Text>
                <TextInput style={[styles.input, styles.textarea]} placeholder="Describe your request..." placeholderTextColor="#4a7a54" value={description} onChangeText={setDescription} multiline numberOfLines={4} textAlignVertical="top" />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setModalVisible(false); resetForm() }}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submitRequest} disabled={submitting}>
                    {submitting ? <ActivityIndicator color="#0d2818" /> : <Text style={styles.submitBtnText}>Submit</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0d2818' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#ffffff' },
  newBtn: { backgroundColor: '#c9a84c', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  newBtnText: { color: '#0d2818', fontWeight: '700', fontSize: 14 },
  tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#102e1a', borderRadius: 10, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#c9a84c' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b8f71' },
  tabTextActive: { color: '#0d2818' },
  statsRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  statCard: { flex: 1, backgroundColor: '#102e1a', borderRadius: 10, padding: 12, borderTopWidth: 3, alignItems: 'center', borderWidth: 1, borderColor: '#1e4d2b' },
  statCardActive: { backgroundColor: '#1e4d2b' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  statLabel: { fontSize: 11, color: '#6b8f71', marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#1e4d2b' },
  filterTabActive: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  filterText: { fontSize: 12, color: '#6b8f71', fontWeight: '600' },
  filterTextActive: { color: '#0d2818' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#4a7a54', fontSize: 16 },
  card: { backgroundColor: '#102e1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1e4d2b' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  cardType: { fontSize: 11, color: '#c9a84c', marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
  badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  cardDesc: { fontSize: 13, color: '#6b8f71', lineHeight: 19, marginBottom: 10 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 12, color: '#4a7a54' },
  priorityDot: { width: 8, height: 8, borderRadius: 4 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  detailValue: { fontSize: 15, color: '#ffffff', marginBottom: 16, lineHeight: 22 },
  closeBtn: { fontSize: 18, color: '#6b8f71', padding: 4 },
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 50,
  },
  modalKav: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#102e1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 48, maxHeight: '92%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#c9a84c', marginBottom: 6 },
  recipientPicker: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  recipientSelected: { color: '#ffffff', fontSize: 14 },
  recipientPlaceholder: { color: '#4a7a54', fontSize: 14 },
  chevron: { color: '#6b8f71', fontSize: 12 },
  recipientDropdown: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, marginBottom: 16, maxHeight: 160, overflow: 'hidden' },
  recipientOption: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#1e4d2b' },
  recipientOptionActive: { backgroundColor: '#c9a84c' },
  recipientOptionText: { color: '#ffffff', fontSize: 14 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#1e4d2b' },
  typeBtnActive: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  typeBtnText: { fontSize: 12, color: '#6b8f71', fontWeight: '600' },
  typeBtnTextActive: { color: '#0d2818' },
  input: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, padding: 12, fontSize: 14, color: '#ffffff', marginBottom: 16 },
  textarea: { height: 100 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: '#6b8f71', fontWeight: '600' },
  submitBtn: { flex: 1, backgroundColor: '#c9a84c', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  submitBtnText: { color: '#0d2818', fontWeight: '700', fontSize: 15 },
  closeBar: { marginTop: 24, backgroundColor: '#1e4d2b', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  closeBarText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
})