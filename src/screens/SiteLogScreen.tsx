import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, Alert, FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'

type Project = { id: string; name: string }

const WEATHER_OPTIONS = ['Sunny', 'Cloudy', 'Rainy', 'Windy', 'Stormy']
const TRADE_OPTIONS = ['Masons', 'Steel Benders', 'Carpenters', 'Glass Fabricators', 'Electricians', 'Plumbers', 'Painters', 'Tilers', 'Welders', 'General Laborers', 'Other']
const REASON_CATEGORIES = ['Insufficient Materials', 'Weather Conditions', 'Labor Shortage', 'Equipment Failure', 'Other']

function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

export default function SiteLogScreen() {
  const [profile, setProfile] = useState<any>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [materials, setMaterials] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'logs' | 'materials' | 'photos' | 'tasks'>('logs')
  const [showProjectPicker, setShowProjectPicker] = useState(false)

  // Log form — also doubles as the task-submission form
  const [showLogModal, setShowLogModal] = useState(false)
  const [activities, setActivities] = useState('')
  const [weather, setWeather] = useState('Sunny')
  const [notes, setNotes] = useState('')
  const [submittingLog, setSubmittingLog] = useState(false)
  const [workerRows, setWorkerRows] = useState([{ trade: 'Masons', count: '' }])

  // Task submission context
  const [logForTask, setLogForTask] = useState<any>(null)
  const [taskOutcome, setTaskOutcome] = useState<'completed' | 'partial' | 'suspended'>('completed')
  const [reasonCategory, setReasonCategory] = useState('')
  const [reasonNotes, setReasonNotes] = useState('')

  // Material forms
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [materialMode, setMaterialMode] = useState<'Delivery' | 'Usage'>('Usage')
  const [materialRows, setMaterialRows] = useState([{ name: '', quantity: '', unit: '' }])
  const [matDate, setMatDate] = useState(new Date().toISOString().split('T')[0])
  const [submittingMat, setSubmittingMat] = useState(false)

  // Photos
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState(getWeekStart())
  const [photos, setPhotos] = useState<any[]>([])

  const showToast = (msg: string) => Alert.alert('', msg)

  const totalWorkers = workerRows.reduce((s, r) => s + (parseInt(r.count) || 0), 0)

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase.from('profiles').select('*, roles(name)').eq('id', user.id).single()
      setProfile({ ...prof, role_name: prof?.roles?.name ?? '' })

      const { data: assignments } = await supabase
        .from('project_assignments')
        .select('project_id, projects(id, name)')
        .eq('profile_id', user.id)

      const projs = assignments?.map((a: any) => a.projects).filter(Boolean) ?? []
      setProjects(projs)

      if (projs.length > 0 && !selectedProject) {
        setSelectedProject(projs[0])
        await loadProjectData(projs[0].id, user.id)
      } else if (selectedProject) {
        await loadProjectData(selectedProject.id, user.id)
      }
    } finally {
      setLoading(false)
    }
  }

  const loadProjectData = async (projectId: string, userId: string) => {
    const [{ data: logsData }, { data: matsData }, { data: taskData }, { data: photosData }] = await Promise.all([
      supabase.from('site_logs').select('*').eq('project_id', projectId).order('date', { ascending: false }),
      supabase.from('site_materials').select('*').eq('project_id', projectId).order('date', { ascending: false }),
      supabase.from('schedule_tasks')
        .select('*, schedule:project_schedules!schedule_id(week_start, week_end, title, created_by, project_id)')
        .eq('assigned_to', userId).order('start_date', { ascending: true }),
      supabase.from('site_photos').select('*').eq('project_id', projectId).order('week_start', { ascending: false }).order('created_at', { ascending: true }),
    ])
    setLogs(logsData ?? [])
    setMaterials(matsData ?? [])
    setTasks((taskData ?? []).filter((t: any) => t.schedule?.project_id === projectId))
    setPhotos(photosData ?? [])
  }

  useFocusEffect(useCallback(() => { loadData() }, []))

  const selectProject = async (project: Project) => {
    setSelectedProject(project)
    setShowProjectPicker(false)
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await loadProjectData(project.id, user.id)
    setLoading(false)
  }

  /* ── Worker rows ── */
  const updateWorkerRow = (idx: number, field: 'trade' | 'count', value: string) => {
    setWorkerRows(rows => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
  }
  const addWorkerRow = () => setWorkerRows(rows => [...rows, { trade: 'Masons', count: '' }])
  const removeWorkerRow = (idx: number) => setWorkerRows(rows => rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows)

  const resetLogForm = () => {
    setActivities(''); setWeather('Sunny'); setNotes('')
    setWorkerRows([{ trade: 'Masons', count: '' }])
    setLogForTask(null); setTaskOutcome('completed'); setReasonCategory(''); setReasonNotes('')
  }

  const openSubmitForTask = (task: any) => {
    setLogForTask(task)
    setTaskOutcome('completed')
    setReasonCategory('')
    setReasonNotes('')
    setShowLogModal(true)
  }

  const submitLog = async () => {
    if (!activities.trim()) return Alert.alert('Required', 'Please enter activities')
    if (!selectedProject) return Alert.alert('Required', 'Please select a project')
    if (logForTask && (taskOutcome === 'partial' || taskOutcome === 'suspended') && !reasonCategory) {
      return Alert.alert('Required', 'Please select a reason')
    }

    try {
      setSubmittingLog(true)
      const { data: { user } } = await supabase.auth.getUser()
      const validRows = workerRows.filter(r => r.trade.trim() && parseInt(r.count) > 0)

      const { data: newLog, error } = await supabase.from('site_logs').insert({
        project_id: selectedProject.id,
        supervisor_id: user!.id,
        date: new Date().toISOString().split('T')[0],
        activities: activities.trim(),
        workers_present: totalWorkers,
        worker_breakdown: validRows.length > 0 ? validRows.map(r => ({ trade: r.trade, count: parseInt(r.count) })) : null,
        weather,
        notes: notes.trim() || null,
      }).select().single()
      if (error) throw error

      if (logForTask) {
        const nowIso = new Date().toISOString()
        const updatePayload: any = {
          status: taskOutcome,
          submitted_at: nowIso, submitted_by: user!.id,
          reason_category: taskOutcome === 'completed' ? null : reasonCategory,
          reason_notes: taskOutcome === 'completed' ? null : (reasonNotes.trim() || null),
          site_log_id: newLog?.id ?? null,
        }
        if (taskOutcome === 'completed') {
          updatePayload.completed_at = nowIso
          updatePayload.completed_by = user!.id
        }
        const { error: taskError } = await supabase.from('schedule_tasks').update(updatePayload).eq('id', logForTask.id)
        if (!taskError) {
          setTasks(prev => prev.map(t => t.id === logForTask.id ? { ...t, ...updatePayload } : t))
          try {
            if (logForTask.schedule?.created_by) {
              const titles: Record<string, string> = { completed: 'Task Completed', partial: 'Task Partially Done', suspended: '⚠ Task Suspended' }
              const messages: Record<string, string> = {
                completed: `"${logForTask.title}" has been completed, with an activity log submitted as proof of work.`,
                partial: `"${logForTask.title}" was only partially completed — reason: ${reasonCategory}.`,
                suspended: `"${logForTask.title}" has been suspended — reason: ${reasonCategory}. This may need your attention.`,
              }
              await supabase.from('notifications').insert({
                recipient_id: logForTask.schedule.created_by,
                title: titles[taskOutcome], message: messages[taskOutcome], is_read: false,
              })
            }
          } catch (notifErr) { console.error('[Notification error]', notifErr) }
        }
      }

      showToast(logForTask
        ? (taskOutcome === 'completed' ? 'Task marked complete!' : taskOutcome === 'partial' ? 'Task marked partially done.' : 'Task marked suspended.')
        : 'Activity log submitted!')
      setShowLogModal(false)
      resetLogForm()
      const { data: { user: u2 } } = await supabase.auth.getUser()
      if (u2) await loadProjectData(selectedProject.id, u2.id)
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setSubmittingLog(false)
    }
  }

  /* ── Material rows ── */
  const updateMaterialRow = (idx: number, field: 'name' | 'quantity' | 'unit', value: string) => {
    setMaterialRows(rows => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
  }
  const addMaterialRow = () => setMaterialRows(rows => [...rows, { name: '', quantity: '', unit: '' }])
  const removeMaterialRow = (idx: number) => setMaterialRows(rows => rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows)

  const submitMaterial = async () => {
    const validRows = materialRows.filter(r => r.name.trim())
    if (validRows.length === 0) return Alert.alert('Required', 'Enter at least one material name')
    if (!selectedProject) return Alert.alert('Required', 'Please select a project')
    try {
      setSubmittingMat(true)
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('site_materials').insert(
        validRows.map(r => ({
          project_id: selectedProject.id, logged_by: user!.id,
          name: r.name.trim(), quantity: r.quantity ? parseFloat(r.quantity) : 0,
          unit: r.unit.trim(), type: materialMode, date: matDate,
        }))
      )
      if (error) throw error
      setShowMaterialModal(false)
      setMaterialMode('Usage')
      setMaterialRows([{ name: '', quantity: '', unit: '' }])
      const { data: { user: u2 } } = await supabase.auth.getUser()
      if (u2) await loadProjectData(selectedProject.id, u2.id)
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setSubmittingMat(false)
    }
  }

  /* ── Stock ── */
  const stockRows = (() => {
    const map: Record<string, { name: string; unit: string; received: number; used: number }> = {}
    materials.forEach(m => {
      const key = `${m.name.trim().toLowerCase()}|${(m.unit || '').trim().toLowerCase()}`
      if (!map[key]) map[key] = { name: m.name, unit: m.unit, received: 0, used: 0 }
      if (m.type === 'Delivery') map[key].received += Number(m.quantity || 0)
      else map[key].used += Number(m.quantity || 0)
    })
    return Object.values(map)
  })()

  const today = new Date().toISOString().split('T')[0]
  const currentWeekStart = getWeekStart()
  const weeks = Array.from(new Set(photos.map(p => p.week_start))).sort((a, b) => b.localeCompare(a))
  const weekPhotos = photos.filter(p => p.week_start === selectedWeek)
  const currentWeekPhotos = photos.filter(p => p.week_start === currentWeekStart)

  const pickAndUploadSitePhoto = async () => {
    if (!selectedProject) return
    if (currentWeekPhotos.length >= 5) { Alert.alert('Limit reached', 'You can upload up to 5 photos per week.'); return }
    const ImagePicker = await import('expo-image-picker')
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) { Alert.alert('Permission needed', 'Please allow access to your photo library'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
    if (result.canceled) return
    try {
      setUploadingPhoto(true)
      const { data: { user } } = await supabase.auth.getUser()
      const asset = result.assets[0]
      const ext = asset.uri.split('.').pop()
      const fileName = `${selectedProject.id}/${currentWeekStart}/${Date.now()}.${ext}`
      const formData = new FormData()
      formData.append('file', { uri: asset.uri, name: fileName, type: `image/${ext}` } as any)
      const { data, error } = await supabase.storage.from('site-photos').upload(fileName, formData, { contentType: 'multipart/form-data' })
      if (error) throw error
      const { data: urlData } = supabase.storage.from('site-photos').getPublicUrl(data.path)
      await supabase.from('site_photos').insert({ project_id: selectedProject.id, uploaded_by: user!.id, week_start: currentWeekStart, photo_url: urlData.publicUrl })
      setSelectedWeek(currentWeekStart)
      const { data: { user: u2 } } = await supabase.auth.getUser()
      if (u2) await loadProjectData(selectedProject.id, u2.id)
    } catch (e: any) {
      Alert.alert('Upload Error', e.message)
    } finally {
      setUploadingPhoto(false)
    }
  }

  const pendingTasks = tasks.filter(t => t.status === 'pending' || !t.status)
  const flaggedTasks = tasks.filter(t => t.status === 'partial' || t.status === 'suspended')
  const completedTasks = tasks.filter(t => t.status === 'completed')

  const renderLog = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardDate}>{new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        <View style={styles.weatherBadge}><Text style={styles.weatherText}>{item.weather ?? '—'}</Text></View>
      </View>
      <Text style={styles.cardLabel}>Activities</Text>
      <Text style={styles.cardValue}>{item.activities}</Text>
      {item.workers_present > 0 && (
        <>
          <Text style={styles.cardLabel}>Workers Present — {item.workers_present}</Text>
          {item.worker_breakdown?.length > 0 && (
            <View style={styles.matRow}>
              {item.worker_breakdown.map((w: any, i: number) => (
                <View key={i} style={styles.matChip}><Text style={styles.matChipText}>{w.trade}: {w.count}</Text></View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  )

  const renderMaterial = ({ item }: { item: any }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardDate}>{item.date ? new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</Text>
      </View>
      <View style={styles.matRow}>
        <View style={[styles.matChip, item.type === 'Delivery' ? { borderColor: '#4caf82' } : { borderColor: '#c9a84c' }]}>
          <Text style={[styles.matChipText, item.type === 'Delivery' ? { color: '#4caf82' } : { color: '#c9a84c' }]}>
            {item.type === 'Delivery' ? 'Received' : 'Used'}: {item.quantity} {item.unit ?? ''}
          </Text>
        </View>
      </View>
    </View>
  )

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Site Log</Text>
        {profile?.role_name === 'Site Supervisor' && activeTab === 'logs' && (
          <TouchableOpacity style={styles.newBtn} onPress={() => setShowLogModal(true)}>
            <Text style={styles.newBtnText}>+ New</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.projectPicker} onPress={() => setShowProjectPicker(true)}>
        <Text style={styles.projectPickerLabel}>Project</Text>
        <Text style={styles.projectPickerValue}>{selectedProject?.name ?? 'Select project...'}</Text>
        <Text style={styles.chevron}>▼</Text>
      </TouchableOpacity>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow} contentContainerStyle={{ paddingHorizontal: 4 }}>
        {(['logs', 'materials', 'photos', 'tasks'] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.tabBtn, activeTab === t && styles.tabBtnActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === 'logs' ? 'Logs' : t === 'materials' ? 'Materials' : t === 'photos' ? 'Photos' : 'Tasks'}
              {t === 'tasks' && flaggedTasks.length > 0 ? ` (${flaggedTasks.length})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#c9a84c" size="large" /></View>
      ) : !selectedProject ? (
        <View style={styles.center}><Text style={styles.emptyIcon}>🏗️</Text><Text style={styles.emptyText}>No projects assigned yet</Text></View>
      ) : activeTab === 'logs' ? (
        <FlatList data={logs} keyExtractor={i => i.id} renderItem={renderLog} contentContainerStyle={{ padding: 16, gap: 12 }}
          onRefresh={loadData} refreshing={loading}
          ListEmptyComponent={<View style={styles.center}><Text style={styles.emptyIcon}>📋</Text><Text style={styles.emptyText}>No logs yet</Text></View>} />
      ) : activeTab === 'materials' ? (
        <FlatList
          data={materials} keyExtractor={i => i.id} renderItem={renderMaterial} contentContainerStyle={{ padding: 16, gap: 12 }}
          onRefresh={loadData} refreshing={loading}
          ListHeaderComponent={stockRows.length > 0 ? (
            <View style={[styles.card, { marginBottom: 12 }]}>
              <Text style={styles.cardTitle}>Stock Summary</Text>
              {stockRows.map((s, i) => {
                const balance = s.received - s.used
                return (
                  <View key={i} style={styles.stockRow}>
                    <Text style={styles.stockName}>{s.name} ({s.unit})</Text>
                    <Text style={styles.stockNums}>
                      <Text style={{ color: '#4caf82' }}>{s.received} in</Text>{'  ·  '}
                      <Text style={{ color: '#c9a84c' }}>{s.used} out</Text>{'  ·  '}
                      <Text style={{ color: balance < 0 ? '#e05c5c' : '#ffffff', fontWeight: '700' }}>{balance} left</Text>
                    </Text>
                  </View>
                )
              })}
            </View>
          ) : null}
          ListEmptyComponent={<View style={styles.center}><Text style={styles.emptyIcon}>🧱</Text><Text style={styles.emptyText}>No materials logged yet</Text></View>} />
      ) : activeTab === 'photos' ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {profile?.role_name === 'Site Supervisor' && (
            <TouchableOpacity style={[styles.photoUploadBtn, currentWeekPhotos.length >= 5 && { opacity: 0.5 }]} onPress={pickAndUploadSitePhoto} disabled={uploadingPhoto || currentWeekPhotos.length >= 5}>
              {uploadingPhoto ? <ActivityIndicator color="#c9a84c" /> : <Text style={styles.photoUploadText}>📷 Add Photo ({currentWeekPhotos.length}/5 this week)</Text>}
            </TouchableOpacity>
          )}
          {weeks.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {weeks.map(w => (
                <TouchableOpacity key={w} style={[styles.weekChip, selectedWeek === w && styles.weekChipActive]} onPress={() => setSelectedWeek(w)}>
                  <Text style={[styles.weekChipText, selectedWeek === w && styles.weekChipTextActive]}>{w === currentWeekStart ? 'This Week' : w}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {weekPhotos.length === 0 ? (
            <View style={styles.center}><Text style={styles.emptyIcon}>📸</Text><Text style={styles.emptyText}>No photos for this week yet</Text></View>
          ) : weekPhotos.map(p => (
            <View key={p.id} style={{ marginBottom: 12 }}>
              <View style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: '#102e1a', overflow: 'hidden' }}>
                <View style={{ flex: 1 }} />
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        /* ══ TASKS TAB ══ */
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} refreshControl={undefined}>
          {tasks.length === 0 ? (
            <View style={styles.center}><Text style={styles.emptyIcon}>✅</Text><Text style={styles.emptyText}>No tasks assigned yet</Text></View>
          ) : (
            <>
              {pendingTasks.length > 0 && (
                <View>
                  <Text style={styles.sectionLabel}>Pending ({pendingTasks.length})</Text>
                  {pendingTasks.map(task => (
                    <View key={task.id} style={styles.taskCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        <Text style={styles.taskTitle}>{task.title}</Text>
                        <View style={styles.categoryChip}><Text style={styles.categoryChipText}>{task.category}</Text></View>
                      </View>
                      {task.description ? <Text style={styles.taskDesc}>{task.description}</Text> : null}
                      <Text style={styles.taskMeta}>
                        {task.start_date ? new Date(task.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
                        {task.end_date ? ` — ${new Date(task.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                      </Text>
                      <TouchableOpacity style={styles.submitTaskBtn} onPress={() => openSubmitForTask(task)}>
                        <Text style={styles.submitTaskBtnText}>Submit</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {flaggedTasks.length > 0 && (
                <View>
                  <Text style={[styles.sectionLabel, { color: '#e08c3c' }]}>Needs Attention ({flaggedTasks.length})</Text>
                  {flaggedTasks.map(task => {
                    const isSuspended = task.status === 'suspended'
                    return (
                      <View key={task.id} style={[styles.taskCard, { borderColor: isSuspended ? '#e05c5c66' : '#c9a84c66' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <Text style={styles.taskTitle}>{task.title}</Text>
                          <View style={[styles.categoryChip, { backgroundColor: isSuspended ? '#e05c5c22' : '#c9a84c22' }]}>
                            <Text style={[styles.categoryChipText, { color: isSuspended ? '#e05c5c' : '#c9a84c' }]}>{isSuspended ? '⚠ Suspended' : 'Partially Done'}</Text>
                          </View>
                        </View>
                        {task.reason_category ? (
                          <Text style={styles.taskDesc}>Reason: {task.reason_category}{task.reason_notes ? ` — ${task.reason_notes}` : ''}</Text>
                        ) : null}
                        <TouchableOpacity style={styles.submitTaskBtn} onPress={() => openSubmitForTask(task)}>
                          <Text style={styles.submitTaskBtnText}>Submit Again</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  })}
                </View>
              )}

              {completedTasks.length > 0 && (
                <View>
                  <Text style={[styles.sectionLabel, { color: '#4caf82' }]}>Completed ({completedTasks.length})</Text>
                  {completedTasks.map(task => (
                    <View key={task.id} style={[styles.taskCard, { opacity: 0.65 }]}>
                      <Text style={[styles.taskTitle, { textDecorationLine: 'line-through' }]}>{task.title}</Text>
                      {task.completed_at && <Text style={styles.taskMeta}>Completed {new Date(task.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>}
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Project Picker */}
      <Modal visible={showProjectPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Project</Text>
            {projects.map(p => (
              <TouchableOpacity key={p.id} style={[styles.projectOption, selectedProject?.id === p.id && styles.projectOptionActive]} onPress={() => selectProject(p)}>
                <Text style={[styles.projectOptionText, selectedProject?.id === p.id && { color: '#0d2818' }]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.closeBar} onPress={() => setShowProjectPicker(false)}><Text style={styles.closeBarText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Activity Log / Task Submission Modal */}
      {showLogModal && (
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalKav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalCard}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>{logForTask ? `Submit: ${logForTask.title}` : 'New Site Log'}</Text>

                {logForTask && (
                  <>
                    <Text style={styles.label}>Outcome</Text>
                    <View style={styles.outcomeRow}>
                      {([
                        { key: 'completed', label: 'Completed', color: '#4caf82' },
                        { key: 'partial', label: 'Partial', color: '#c9a84c' },
                        { key: 'suspended', label: 'Suspended', color: '#e05c5c' },
                      ] as const).map(opt => (
                        <TouchableOpacity key={opt.key} style={[styles.outcomeBtn, taskOutcome === opt.key && { borderColor: opt.color, backgroundColor: opt.color + '22' }]} onPress={() => setTaskOutcome(opt.key)}>
                          <Text style={[styles.outcomeBtnText, taskOutcome === opt.key && { color: opt.color }]}>{opt.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {taskOutcome !== 'completed' && (
                      <>
                        <Text style={styles.label}>Reason *</Text>
                        <View style={styles.weatherRow}>
                          {REASON_CATEGORIES.map(r => (
                            <TouchableOpacity key={r} style={[styles.weatherBtn, reasonCategory === r && styles.weatherBtnActive]} onPress={() => setReasonCategory(r)}>
                              <Text style={[styles.weatherBtnText, reasonCategory === r && styles.weatherBtnTextActive]}>{r}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <TextInput style={[styles.input, styles.textarea]} placeholder="Additional detail (optional)…" placeholderTextColor="#4a7a54" value={reasonNotes} onChangeText={setReasonNotes} multiline />
                      </>
                    )}
                  </>
                )}

                <Text style={styles.label}>Weather</Text>
                <View style={styles.weatherRow}>
                  {WEATHER_OPTIONS.map(w => (
                    <TouchableOpacity key={w} style={[styles.weatherBtn, weather === w && styles.weatherBtnActive]} onPress={() => setWeather(w)}>
                      <Text style={[styles.weatherBtnText, weather === w && styles.weatherBtnTextActive]}>{w}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Activities Carried Out *</Text>
                <TextInput style={[styles.input, styles.textarea]} placeholder="Describe work done today..." placeholderTextColor="#4a7a54" value={activities} onChangeText={setActivities} multiline numberOfLines={4} />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.label}>Workers Present, by Trade</Text>
                  <Text style={{ color: '#c9a84c', fontWeight: '700', fontSize: 13 }}>Total: {totalWorkers}</Text>
                </View>
                {workerRows.map((row, idx) => (
                  <View key={idx} style={styles.rowInputs}>
                    <TextInput style={[styles.input, { flex: 1.5, marginBottom: 0 }]} placeholder="Trade" placeholderTextColor="#4a7a54" value={row.trade} onChangeText={v => updateWorkerRow(idx, 'trade', v)} />
                    <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Count" placeholderTextColor="#4a7a54" value={row.count} onChangeText={v => updateWorkerRow(idx, 'count', v)} keyboardType="number-pad" />
                    {workerRows.length > 1 && (
                      <TouchableOpacity onPress={() => removeWorkerRow(idx)} style={styles.rowRemoveBtn}><Text style={{ color: '#e05c5c', fontWeight: '700' }}>✕</Text></TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity onPress={addWorkerRow} style={styles.addRowBtn}><Text style={styles.addRowBtnText}>+ Add Trade</Text></TouchableOpacity>

                <Text style={[styles.label, { marginTop: 16 }]}>Notes</Text>
                <TextInput style={[styles.input, styles.textarea]} placeholder="Additional notes..." placeholderTextColor="#4a7a54" value={notes} onChangeText={setNotes} multiline numberOfLines={3} />

                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowLogModal(false); resetLogForm() }}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.submitBtn, submittingLog && { opacity: 0.6 }]} onPress={submitLog} disabled={submittingLog}>
                    {submittingLog ? <ActivityIndicator color="#0d2818" /> : <Text style={styles.submitBtnText}>Submit</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* Material Modal */}
      {showMaterialModal && (
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalKav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalCard}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Log Material</Text>
                <View style={styles.modeToggleRow}>
                  {(['Usage', 'Delivery'] as const).map(m => (
                    <TouchableOpacity key={m} style={[styles.modeBtn, materialMode === m && styles.modeBtnActive]} onPress={() => setMaterialMode(m)}>
                      <Text style={[styles.modeBtnText, materialMode === m && styles.modeBtnTextActive]}>{m === 'Delivery' ? '📦 Delivery' : '🔨 Usage'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {materialRows.map((row, idx) => (
                  <View key={idx} style={{ marginBottom: 12, backgroundColor: '#0d2818', borderRadius: 10, borderWidth: 1, borderColor: '#1e4d2b', padding: 12 }}>
                    <TextInput style={[styles.input, { marginBottom: 8 }]} placeholder="Material name" placeholderTextColor="#4a7a54" value={row.name} onChangeText={v => updateMaterialRow(idx, 'name', v)} />
                    <View style={styles.rowInputs}>
                      <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Qty" placeholderTextColor="#4a7a54" value={row.quantity} onChangeText={v => updateMaterialRow(idx, 'quantity', v)} keyboardType="numeric" />
                      <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Unit" placeholderTextColor="#4a7a54" value={row.unit} onChangeText={v => updateMaterialRow(idx, 'unit', v)} />
                      {materialRows.length > 1 && (
                        <TouchableOpacity onPress={() => removeMaterialRow(idx)} style={styles.rowRemoveBtn}><Text style={{ color: '#e05c5c', fontWeight: '700' }}>✕</Text></TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
                <TouchableOpacity onPress={addMaterialRow} style={styles.addRowBtn}><Text style={styles.addRowBtnText}>+ Add Material</Text></TouchableOpacity>
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowMaterialModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.submitBtn, submittingMat && { opacity: 0.6 }]} onPress={submitMaterial} disabled={submittingMat}>
                    {submittingMat ? <ActivityIndicator color="#0d2818" /> : <Text style={styles.submitBtnText}>Submit</Text>}
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
  projectPicker: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#102e1a', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#1e4d2b' },
  projectPickerLabel: { fontSize: 12, color: '#c9a84c', fontWeight: '600', marginRight: 8 },
  projectPickerValue: { flex: 1, fontSize: 14, color: '#ffffff', fontWeight: '600' },
  chevron: { color: '#6b8f71', fontSize: 12 },
  tabRow: { marginHorizontal: 16, marginBottom: 12 },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, marginRight: 6, backgroundColor: '#102e1a' },
  tabBtnActive: { backgroundColor: '#c9a84c' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#6b8f71' },
  tabTextActive: { color: '#0d2818' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#4a7a54', fontSize: 16, textAlign: 'center' },
  card: { backgroundColor: '#102e1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1e4d2b' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff', flex: 1, marginBottom: 8 },
  cardDate: { fontSize: 13, color: '#c9a84c', fontWeight: '600' },
  cardLabel: { fontSize: 11, color: '#6b8f71', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  cardValue: { fontSize: 14, color: '#ffffff', marginBottom: 4, lineHeight: 20 },
  weatherBadge: { backgroundColor: '#1e4d2b', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  weatherText: { fontSize: 12, color: '#c9a84c', fontWeight: '600' },
  matRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  matChip: { borderWidth: 1, borderColor: '#c9a84c', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  matChipText: { fontSize: 12, color: '#c9a84c', fontWeight: '600' },
  stockRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#1e4d2b' },
  stockName: { fontSize: 13, color: '#ffffff', fontWeight: '500', flex: 1 },
  stockNums: { fontSize: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#c9a84c', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  taskCard: { backgroundColor: '#102e1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1e4d2b', marginBottom: 10 },
  taskTitle: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
  taskDesc: { fontSize: 12, color: '#8fae93', marginBottom: 8 },
  taskMeta: { fontSize: 11, color: '#6b8f71', marginBottom: 10 },
  categoryChip: { backgroundColor: '#1e4d2b', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  categoryChipText: { fontSize: 10, color: '#c9a84c', fontWeight: '700' },
  submitTaskBtn: { backgroundColor: '#4caf82', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  submitTaskBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  outcomeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  outcomeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#1e4d2b', alignItems: 'center' },
  outcomeBtnText: { fontSize: 12, fontWeight: '700', color: '#6b8f71' },
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50 },
  modalKav: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#102e1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 48, maxHeight: '92%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#c9a84c', marginBottom: 6 },
  input: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, padding: 12, fontSize: 14, color: '#ffffff', marginBottom: 16 },
  textarea: { height: 90 },
  weatherRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  weatherBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#1e4d2b' },
  weatherBtnActive: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  weatherBtnText: { fontSize: 12, color: '#6b8f71', fontWeight: '600' },
  weatherBtnTextActive: { color: '#0d2818' },
  rowInputs: { flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'center' },
  rowRemoveBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#2e1616', alignItems: 'center', justifyContent: 'center' },
  addRowBtn: { alignSelf: 'flex-start', backgroundColor: '#1e4d2b', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginBottom: 8 },
  addRowBtnText: { color: '#c9a84c', fontWeight: '700', fontSize: 12 },
  modeToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  modeBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1e4d2b', alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  modeBtnText: { color: '#6b8f71', fontWeight: '700', fontSize: 13 },
  modeBtnTextActive: { color: '#0d2818' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: '#6b8f71', fontWeight: '600' },
  submitBtn: { flex: 1, backgroundColor: '#c9a84c', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  submitBtnText: { color: '#0d2818', fontWeight: '700', fontSize: 15 },
  projectOption: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#1e4d2b', borderRadius: 8 },
  projectOptionActive: { backgroundColor: '#c9a84c' },
  projectOptionText: { fontSize: 15, color: '#ffffff', fontWeight: '600' },
  closeBar: { marginTop: 16, backgroundColor: '#1e4d2b', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  closeBarText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  photoUploadBtn: { backgroundColor: '#102e1a', borderWidth: 1, borderColor: '#c9a84c', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 16, borderStyle: 'dashed' },
  photoUploadText: { color: '#c9a84c', fontWeight: '600', fontSize: 14 },
  weekChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#1e4d2b', marginRight: 8 },
  weekChipActive: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  weekChipText: { fontSize: 12, color: '#6b8f71', fontWeight: '600' },
  weekChipTextActive: { color: '#0d2818' },
})