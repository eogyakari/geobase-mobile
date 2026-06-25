import { useEffect, useState, useRef } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView,
  Platform, Modal, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'

type Room = {
  id: string
  name: string
  type: string
  project_id?: string
  members?: any[]
  lastMessage?: any
}

type Message = {
  id: string
  content: string
  sender_id: string
  created_at: string
  sender?: { id: string; full_name: string }
}

type Profile = {
  id: string
  full_name: string
  organization_id: string
}

export default function ChatScreen() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [orgUsers, setOrgUsers] = useState<Profile[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showNewDM, setShowNewDM] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [msgLoading, setMsgLoading] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const channelRef = useRef<any>(null)

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)

      const { data: users } = await supabase
        .from('profiles')
        .select('id, full_name, organization_id')
        .eq('organization_id', prof.organization_id)
        .neq('id', user.id)
        .order('full_name')
      setOrgUsers(users ?? [])

      await ensureProjectRooms(prof)
      await loadRooms(prof.id)
    } finally {
      setLoading(false)
    }
  }

  const ensureProjectRooms = async (prof: any) => {
    const { data: assignments } = await supabase
      .from('project_assignments')
      .select('project_id, projects(id, name)')
      .eq('profile_id', prof.id)

    for (const a of assignments ?? []) {
      const project = (a as any).projects
      if (!project) continue

      const { data: existing } = await supabase
        .from('chat_rooms')
        .select('id')
        .eq('type', 'project')
        .eq('project_id', project.id)
        .maybeSingle()

      let roomId = existing?.id

      if (!roomId) {
        const { data: newRoom } = await supabase
          .from('chat_rooms')
          .insert({ name: project.name, type: 'project', project_id: project.id, created_by: prof.id })
          .select().single()
        roomId = newRoom?.id

        if (roomId) {
          const { data: members } = await supabase
            .from('project_assignments')
            .select('profile_id')
            .eq('project_id', project.id)
          if (members) {
            await supabase.from('chat_members').insert(
              members.map((m: any) => ({ room_id: roomId, profile_id: m.profile_id }))
            )
          }
        }
      } else {
        const { data: isMember } = await supabase
          .from('chat_members')
          .select('id')
          .eq('room_id', roomId)
          .eq('profile_id', prof.id)
          .maybeSingle()

        if (!isMember) {
          await supabase.from('chat_members')
            .insert({ room_id: roomId, profile_id: prof.id })
        }
      }
    }
  }

  const loadRooms = async (userId: string) => {
    const { data: memberships } = await supabase
      .from('chat_members')
      .select('room_id')
      .eq('profile_id', userId)

    if (!memberships?.length) { setRooms([]); return }

    const roomIds = memberships.map((m: any) => m.room_id)

    const { data: roomsData } = await supabase
      .from('chat_rooms')
      .select('id, name, type, project_id, created_at, members:chat_members(profile_id, profile:profiles!profile_id(id, full_name))')
      .in('id', roomIds)

    const enriched = await Promise.all((roomsData ?? []).map(async (room: any) => {
      const { data: last } = await supabase
        .from('chat_messages')
        .select('content, created_at')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return { ...room, lastMessage: last }
    }))

    enriched.sort((a: any, b: any) => {
      const ta = a.lastMessage?.created_at ?? a.created_at
      const tb = b.lastMessage?.created_at ?? b.created_at
      return new Date(tb).getTime() - new Date(ta).getTime()
    })

    setRooms(enriched)
  }

  const openRoom = async (room: Room) => {
    setActiveRoom(room)
    setMsgLoading(true)

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    try {
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('*, sender:profiles!sender_id(id, full_name)')
        .eq('room_id', room.id)
        .order('created_at', { ascending: true })
      setMessages(msgs ?? [])
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100)
    } finally {
      setMsgLoading(false)
    }

    const channel = supabase.channel(`room-${room.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `room_id=eq.${room.id}`,
      }, async (payload) => {
        const { data: msg } = await supabase
          .from('chat_messages')
          .select('*, sender:profiles!sender_id(id, full_name)')
          .eq('id', payload.new.id).single()
        if (msg) {
          setMessages(prev => [...prev, msg])
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
        }
      })
      .subscribe()
    channelRef.current = channel
  }

  const sendMessage = async () => {
    if (!content.trim() || !activeRoom || !profile) return
    setSending(true)
    const text = content.trim()
    setContent('')
    try {
      const { error } = await supabase.from('chat_messages').insert({
        room_id: activeRoom.id, sender_id: profile.id, content: text,
      })
      if (error) { setContent(text); Alert.alert('Error', error.message) }
    } finally {
      setSending(false)
    }
  }

  const startDM = async (otherUser: Profile) => {
    setShowNewDM(false)
    setUserSearch('')
    if (!profile) return

    try {
      const { data: myMemberships } = await supabase
        .from('chat_members').select('room_id').eq('profile_id', profile.id)
      const { data: theirMemberships } = await supabase
        .from('chat_members').select('room_id').eq('profile_id', otherUser.id)

      const myIds = new Set((myMemberships ?? []).map((m: any) => m.room_id))
      const shared = (theirMemberships ?? []).find((m: any) => myIds.has(m.room_id))

      if (shared) {
        const { data: existingRoom } = await supabase
          .from('chat_rooms').select('id').eq('id', shared.room_id).eq('type', 'direct').maybeSingle()
        if (existingRoom) {
          await loadRooms(profile.id)
          const found = rooms.find(r => r.id === existingRoom.id)
          if (found) { openRoom(found); return }
        }
      }

      const { data: newRoom, error } = await supabase
        .from('chat_rooms')
        .insert({ type: 'direct', created_by: profile.id })
        .select().single()

      if (error || !newRoom) { Alert.alert('Error', error?.message ?? 'Failed to create room'); return }

      await supabase.from('chat_members').insert([
        { room_id: newRoom.id, profile_id: profile.id },
        { room_id: newRoom.id, profile_id: otherUser.id },
      ])

      await loadRooms(profile.id)

      const roomWithMembers: Room = {
        ...newRoom,
        members: [
          { profile_id: profile.id, profile },
          { profile_id: otherUser.id, profile: otherUser },
        ],
        lastMessage: null,
      }
      openRoom(roomWithMembers)
    } catch (e: any) {
      Alert.alert('Error', e.message)
    }
  }

  const getRoomName = (room: Room) => {
    if (room.type === 'project') return room.name ?? 'Project Chat'
    const other = room.members?.find((m: any) => m.profile?.id !== profile?.id)
    return other?.profile?.full_name ?? 'Direct Message'
  }

  const filteredUsers = orgUsers.filter(u =>
    !userSearch || u.full_name?.toLowerCase().includes(userSearch.toLowerCase())
  )

  const projectRooms = rooms.filter(r => r.type === 'project')
  const directRooms = rooms.filter(r => r.type === 'direct')

  const renderRoom = ({ item }: { item: Room }) => (
    <TouchableOpacity style={styles.roomCard} onPress={() => openRoom(item)}>
      <View style={[styles.roomAvatar, item.type === 'project' && styles.roomAvatarProject]}>
        <Text style={styles.roomAvatarText}>
          {item.type === 'project' ? '#' : getRoomName(item).charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.roomInfo}>
        <View style={styles.roomTop}>
          <Text style={styles.roomName} numberOfLines={1}>{getRoomName(item)}</Text>
          {item.lastMessage && (
            <Text style={styles.roomTime}>
              {new Date(item.lastMessage.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </Text>
          )}
        </View>
        <Text style={styles.roomLastMsg} numberOfLines={1}>
          {item.lastMessage?.content ?? (item.type === 'project' ? 'Project channel' : 'Start a conversation')}
        </Text>
      </View>
    </TouchableOpacity>
  )

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === profile?.id
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        {!isMe && (
          <View style={styles.msgAvatar}>
            <Text style={styles.msgAvatarText}>{item.sender?.full_name?.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={[styles.msgBubble, isMe ? styles.msgBubbleMe : styles.msgBubbleThem]}>
          {!isMe && <Text style={styles.msgSender}>{item.sender?.full_name}</Text>}
          <Text style={[styles.msgContent, isMe && styles.msgContentMe]}>{item.content}</Text>
          <Text style={[styles.msgTime, isMe && styles.msgTimeMe]}>
            {new Date(item.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    )
  }

  // Active chat view
  if (activeRoom) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => {
            setActiveRoom(null)
            if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
            loadRooms(profile!.id)
          }} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatHeaderName} numberOfLines={1}>{getRoomName(activeRoom)}</Text>
            <Text style={styles.chatHeaderSub}>{activeRoom.type === 'project' ? 'Project Channel' : 'Direct Message'}</Text>
          </View>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {msgLoading ? (
            <View style={styles.center}><ActivityIndicator color="#c9a84c" size="large" /></View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={i => i.id}
              renderItem={renderMessage}
              contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.emptyText}>No messages yet. Say hello! 👋</Text>
                </View>
              }
            />
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.msgInput}
              placeholder={`Message ${getRoomName(activeRoom)}...`}
              placeholderTextColor="#4a7a54"
              value={content}
              onChangeText={setContent}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!content.trim() || sending) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!content.trim() || sending}
            >
              {sending ? <ActivityIndicator color="#0d2818" size="small" /> : <Text style={styles.sendBtnText}>➤</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    )
  }


  // Room list view
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => setShowNewDM(true)}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#c9a84c" size="large" /></View>
      ) : rooms.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyText}>No conversations yet</Text>
          <TouchableOpacity style={styles.startBtn} onPress={() => setShowNewDM(true)}>
            <Text style={styles.startBtnText}>Start a conversation</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={[
            ...projectRooms.length > 0 ? [{ id: 'proj-header', type: 'header', name: 'PROJECT CHANNELS' } as any] : [],
            ...projectRooms,
            ...directRooms.length > 0 ? [{ id: 'dm-header', type: 'header', name: 'DIRECT MESSAGES' } as any] : [],
            ...directRooms,
          ]}
          keyExtractor={i => i.id}
          renderItem={({ item }) => {
            if (item.type === 'header') return (
              <Text style={styles.sectionHeader}>{item.name}</Text>
            )
            return renderRoom({ item })
          }}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          onRefresh={() => profile && loadRooms(profile.id)}
          refreshing={loading}
        />
      )}

      {/* New DM Modal */}
      <Modal visible={showNewDM} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Message</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search colleagues..."
              placeholderTextColor="#4a7a54"
              value={userSearch}
              onChangeText={setUserSearch}
              autoFocus
            />
            <FlatList
              data={filteredUsers}
              keyExtractor={i => i.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.userOption} onPress={() => startDM(item)}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{item.full_name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.userName}>{item.full_name}</Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 400 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No users found</Text>}
            />
            <TouchableOpacity style={styles.closeBar} onPress={() => { setShowNewDM(false); setUserSearch('') }}>
              <Text style={styles.closeBarText}>Cancel</Text>
            </TouchableOpacity>
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
  newBtn: { backgroundColor: '#c9a84c', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  newBtnText: { color: '#0d2818', fontWeight: '700', fontSize: 14 },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: '#6b8f71', textTransform: 'uppercase', letterSpacing: 1, paddingVertical: 8, paddingHorizontal: 4 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#4a7a54', fontSize: 15, textAlign: 'center' },
  startBtn: { marginTop: 16, backgroundColor: '#c9a84c', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  startBtnText: { color: '#0d2818', fontWeight: '700' },
  roomCard: { flexDirection: 'row', backgroundColor: '#102e1a', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1e4d2b', gap: 12, alignItems: 'center' },
  roomAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#c9a84c', alignItems: 'center', justifyContent: 'center' },
  roomAvatarProject: { backgroundColor: '#1e4d2b', borderWidth: 1, borderColor: '#c9a84c' },
  roomAvatarText: { fontSize: 20, fontWeight: '800', color: '#0d2818' },
  roomInfo: { flex: 1 },
  roomTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  roomName: { fontSize: 15, fontWeight: '700', color: '#ffffff', flex: 1 },
  roomTime: { fontSize: 11, color: '#4a7a54', marginLeft: 8 },
  roomLastMsg: { fontSize: 13, color: '#6b8f71' },
  chatHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1e4d2b', gap: 12 },
  backBtn: { padding: 4 },
  backBtnText: { color: '#c9a84c', fontSize: 15, fontWeight: '600' },
  chatHeaderInfo: { flex: 1 },
  chatHeaderName: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  chatHeaderSub: { fontSize: 12, color: '#6b8f71' },
  msgRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  msgRowMe: { flexDirection: 'row-reverse' },
  msgAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1e4d2b', alignItems: 'center', justifyContent: 'center' },
  msgAvatarText: { fontSize: 13, fontWeight: '700', color: '#c9a84c' },
  msgBubble: { maxWidth: '75%', borderRadius: 16, padding: 10, paddingHorizontal: 14 },
  msgBubbleMe: { backgroundColor: '#c9a84c33', borderWidth: 1, borderColor: '#c9a84c44', borderBottomRightRadius: 4 },
  msgBubbleThem: { backgroundColor: '#102e1a', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#1e4d2b' },
  msgSender: { fontSize: 11, color: '#c9a84c', fontWeight: '600', marginBottom: 3 },
  msgContent: { fontSize: 14, color: '#ffffff', lineHeight: 20 },
  msgContentMe: { color: '#e8e0d0' },
  msgTime: { fontSize: 10, color: '#6b8f71', marginTop: 3, textAlign: 'right' },
  msgTimeMe: { color: '#c9a84c88' },
  inputRow: { flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#1e4d2b', alignItems: 'flex-end', backgroundColor: '#102e1a' },
  msgInput: { flex: 1, backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#ffffff', maxHeight: 100 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#c9a84c', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { fontSize: 18, color: '#0d2818' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#102e1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', marginBottom: 16 },
  searchInput: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, padding: 12, fontSize: 14, color: '#ffffff', marginBottom: 12 },
  userOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e4d2b' },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#c9a84c', alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: 16, fontWeight: '800', color: '#0d2818' },
  userName: { fontSize: 15, color: '#ffffff', fontWeight: '600' },
  closeBar: { marginTop: 16, backgroundColor: '#1e4d2b', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  closeBarText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
})