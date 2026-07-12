import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, Alert, FlatList, Image, Dimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'

const SCREEN_WIDTH = Dimensions.get('window').width

type Project = { id: string; name: string }
type SiteLog = {
  id: string
  date: string
  activities: string
  workers_present: number
  worker_breakdown: { trade: string; count: number }[] | null
  weather: string
  notes: string
  created_at: string
}
type SiteMaterial = {
  id: string
  name: string
  quantity: number
  unit: string
  type: 'Delivery' | 'Usage'
  date: string
}
type SitePhoto = {
  id: string
  photo_url: string
  week_start: string
  created_at: string
}

const WEATHER_OPTIONS = ['Sunny', 'Cloudy', 'Rainy', 'Windy', 'Stormy']

function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

function formatWeekLabel(weekStart: string) {
  const start = new Date(weekStart)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

export default function SiteLogScreen() {
  const [profile, setProfile] = useState<any>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [logs, setLogs] = useState<SiteLog[]>([])
  const [materials, setMaterials] = useState<SiteMaterial[]>([])
  const [photos, setPhotos] = useState<SitePhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'logs' | 'materials' | 'photos'>('logs')
  const [showProjectPicker, setShowProjectPicker] = useState(false)

  // Log form
  const [showLogModal, setShowLogModal] = useState(false)
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0])
  const [activities, setActivities] = useState('')
  const [weather, setWeather] = useState('Sunny')
  const [notes, setNotes] = useState('')
  const [submittingLog, setSubmittingLog] = useState(false)
  const [workerRows, setWorkerRows] = useState([{ trade: 'Masons', count: '' }])

  // Material form
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [materialMode, setMaterialMode] = useState<'Delivery' | 'Usage'>('Usage')
  const [materialRows, setMaterialRows] = useState([{ name: '', quantity: '', unit: '' }])
  const [matDate, setMatDate] = useState(new Date().toISOString().split('T')[0])
  const [submittingMat, setSubmittingMat] = useState(false)

  // Photos
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [selectedWeek, setSelectedWeek] = useState(getWeekStart())

  const totalWorkers = workerRows.reduce((s, r) => s + (parseInt(r.count) || 0), 0)

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase
        .from('profiles').select('*, roles(name)').eq('id', user.id).single()
      setProfile({ ...prof, role_name: prof?.roles?.name ?? '' })

      const { data: assignments } = await supabase
        .from('project_assignments')
        .select('project_id, projects(id, name)')
        .eq('profile_id', user.id)

      const projs = assignments?.map((a: any) => a.projects).filter(Boolean) ?? []
      setProjects(projs)

      if (projs.length > 0 && !selectedProject) {
        setSelectedProject(projs[0])
        await loadProjectData(projs[0].id)
      } else if (selectedProject) {
        await loadProjectData(selectedProject.id)
      }
    } finally {
      setLoading(false)
    }
  }

  const loadProjectData = async (projectId: string) => {
    const [{ data: logsData }, { data: matsData }, { data: photosData }] = await Promise.all([
      supabase.from('site_logs').select('*').eq('project_id', projectId).order('date', { ascending: false }),
      supabase.from('site_materials').select('*').eq('project_id', projectId).order('date', { ascending: false }),
      supabase.from('site_photos').select('*').eq('project_id', projectId).order('week_start', { ascending: false }).order('created_at', { ascending: true }),
    ])
    setLogs(logsData ?? [])
    setMaterials(matsData ?? [])
    setPhotos(photosData ?? [])
  }

  useFocusEffect(useCallback(() => { loadData() }, []))

  const selectProject = async (project: Project) => {
    setSelectedProject(project)
    setShowProjectPicker(false)
    setLoading(true)
    await loadProjectData(project.id)
    setLoading(false)
  }

  /* ── Worker rows ── */
  const updateWorkerRow = (idx: number, field: 'trade' | 'count', value: string) => {
    setWorkerRows(rows => rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
  }
  const addWorkerRow = () => setWorkerRows(rows => [...rows, { trade: '', count: '' }])
  const removeWorkerRow = (idx: number) => setWorkerRows(rows => rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows)

  const submitLog = async () => {
    if (!activities.trim()) return Alert.alert('Required', 'Please enter activities')
    if (!selectedProject) return Alert.alert('Required', 'Please select a project')
    try {
      setSubmittingLog(true)
      const { data: { user } } = await supabase.auth.getUser()
      const validRows = workerRows.filter(r => r.trade.trim() && parseInt(r.count) > 0)
      const { error } = await supabase.from('site_logs').insert({
        project_id: selectedProject.id,
        supervisor_id: user!.id,
        date: logDate,
        activities: activities.trim(),
        workers_present: totalWorkers,
        worker_breakdown: validRows.length > 0 ? validRows.map(r => ({ trade: r.trade, count: parseInt(r.count) })) : null,
        weather,
        notes: notes.trim() || null,
      })
      if (error) throw error
      setShowLogModal(false)
      resetLogForm()
      await loadProjectData(selectedProject.id)
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
          project_id: selectedProject.id,
          logged_by: user!.id,
          name: r.name.trim(),
          quantity: r.quantity ? parseFloat(r.quantity) : 0,
          unit: r.unit.trim(),
          type: materialMode,
          date: matDate,
        }))
      )
      if (error) throw error
      setShowMaterialModal(false)
      resetMatForm()
      await loadProjectData(selectedProject.id)
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setSubmittingMat(false)
    }
  }

  const resetLogForm = () => {
    setLogDate(new Date().toISOString().split('T')[0])
    setActivities('')
    setWeather('Sunny')
    setNotes('')
    setWorkerRows([{ trade: 'Masons', count: '' }])
  }

  const resetMatForm = () => {
    setMaterialMode('Usage')
    setMaterialRows([{ name: '', quantity: '', unit: '' }])
    setMatDate(new Date().toISOString().split('T')[0])
  }

  /* ── Stock computation ── */
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

  /* ── Photos ── */
  const currentWeekStart = getWeekStart()
  const weeks = Array.from(new Set(photos.map(p => p.week_start))).sort((a, b) => b.localeCompare(a))
  const weekPhotos = photos.filter(p => p.week_start === selectedWeek)
  const currentWeekPhotos = photos.filter(p => p.week_start === currentWeekStart)

  const pickAndUploadSitePhoto = async () => {
    if (!selectedProject) return
    if (currentWeekPhotos.length >= 5) {
      Alert.alert('Limit reached', 'You can upload up to 5 photos per week.')
      return
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    })
    if (result.canceled) return

    try {
      setUploadingPhoto(true)
      const { data: { user } } = await supabase.auth.getUser()
      const asset = result.assets[0]
      const ext = asset.uri.split('.').pop()
      const fileName = `${selectedProject.id}/${currentWeekStart}/${Date.now()}.${ext}`
      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        name: fileName,
        type: `image/${ext}`,
      } as any)

      const { data, error } = await supabase.storage
        .from('site-photos')
        .upload(fileName, formData, { contentType: 'multipart/form-data' })

      if (error) throw error

      const { data: urlData } = supabase.storage.from('site-photos').getPublicUrl(data.path)
      await supabase.from('site_photos').insert({
        project_id: selectedProject.id,
        uploaded_by: user!.id,
        week_start: currentWeekStart,
        photo_url: urlData.publicUrl,
      })
      setSelectedWeek(currentWeekStart)
      await loadProjectData(selectedProject.id)
    } catch (e: any) {
      Alert.alert('Upload Error', e.message)
    } finally {
      setUploadingPhoto(false)
    }
  }

  const deleteSitePhoto = async (id: string) => {
    if (!selectedProject) return
    await supabase.from('site_photos').delete().eq('id', id)
    await loadProjectData(selectedProject.id)
  }

  /* ── Render ── */
  const renderLog = ({ item }: { item: SiteLog }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardDate}>{new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
        <View style={styles.weatherBadge}>
          <Text style={styles.weatherText}>{item.weather ?? '—'}</Text>
        </View>
      </View>
      <Text style={styles.cardLabel}>Activities</Text>
      <Text style={styles.cardValue}>{item.activities}</Text>
      {item.workers_present > 0 && (
        <>
          <Text style={styles.cardLabel}>Workers Present — {item.workers_present}</Text>
          {item.worker_breakdown && item.worker_breakdown.length > 0 && (
            <View style={styles.matRow}>
              {item.worker_breakdown.map((w, i) => (
                <View key={i} style={styles.matChip}>
                  <Text style={styles.matChipText}>{w.trade}: {w.count}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
      {item.notes && (
        <>
          <Text style={[styles.cardLabel, { marginTop: 10 }]}>Notes</Text>
          <Text style={styles.cardValue}>{item.notes}</Text>
        </>
      )}
    </View>
  )

  const renderMaterial = ({ item }: { item: SiteMaterial }) => (
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
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Site Log</Text>
        {profile?.role_name === 'Site Supervisor' && activeTab !== 'photos' && (
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => activeTab === 'logs' ? setShowLogModal(true) : setShowMaterialModal(true)}
          >
            <Text style={styles.newBtnText}>+ New</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Project picker */}
      <TouchableOpacity style={styles.projectPicker} onPress={() => setShowProjectPicker(true)}>
        <Text style={styles.projectPickerLabel}>Project</Text>
        <Text style={styles.projectPickerValue}>{selectedProject?.name ?? 'Select project...'}</Text>
        <Text style={styles.chevron}>▼</Text>
      </TouchableOpacity>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'logs' && styles.tabBtnActive]} onPress={() => setActiveTab('logs')}>
          <Text style={[styles.tabText, activeTab === 'logs' && styles.tabTextActive]}>Logs {logs.length > 0 ? `(${logs.length})` : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'materials' && styles.tabBtnActive]} onPress={() => setActiveTab('materials')}>
          <Text style={[styles.tabText, activeTab === 'materials' && styles.tabTextActive]}>Materials {materials.length > 0 ? `(${materials.length})` : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeTab === 'photos' && styles.tabBtnActive]} onPress={() => setActiveTab('photos')}>
          <Text style={[styles.tabText, activeTab === 'photos' && styles.tabTextActive]}>Photos {photos.length > 0 ? `(${photos.length})` : ''}</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#c9a84c" size="large" /></View>
      ) : !selectedProject ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>🏗️</Text>
          <Text style={styles.emptyText}>No projects assigned yet</Text>
        </View>
      ) : activeTab === 'logs' ? (
        <FlatList
          data={logs}
          keyExtractor={i => i.id}
          renderItem={renderLog}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onRefresh={() => selectedProject && loadProjectData(selectedProject.id)}
          refreshing={loading}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyText}>No logs yet</Text>
              {profile?.role_name === 'Site Supervisor' && (
                <TouchableOpacity style={styles.startBtn} onPress={() => setShowLogModal(true)}>
                  <Text style={styles.startBtnText}>Add First Log</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      ) : activeTab === 'materials' ? (
        <FlatList
          data={materials}
          keyExtractor={i => i.id}
          renderItem={renderMaterial}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onRefresh={() => selectedProject && loadProjectData(selectedProject.id)}
          refreshing={loading}
          ListHeaderComponent={
            stockRows.length > 0 ? (
              <View style={[styles.card, { marginBottom: 12 }]}>
                <Text style={styles.cardTitle}>Stock Summary</Text>
                {stockRows.map((s, i) => {
                  const balance = s.received - s.used
                  return (
                    <View key={i} style={styles.stockRow}>
                      <Text style={styles.stockName}>{s.name} ({s.unit})</Text>
                      <Text style={styles.stockNums}>
                        <Text style={{ color: '#4caf82' }}>{s.received} in</Text>
                        {'  ·  '}
                        <Text style={{ color: '#c9a84c' }}>{s.used} out</Text>
                        {'  ·  '}
                        <Text style={{ color: balance < 0 ? '#e05c5c' : '#ffffff', fontWeight: '700' }}>{balance} left</Text>
                      </Text>
                    </View>
                  )
                })}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>🧱</Text>
              <Text style={styles.emptyText}>No materials logged yet</Text>
              {profile?.role_name === 'Site Supervisor' && (
                <TouchableOpacity style={styles.startBtn} onPress={() => setShowMaterialModal(true)}>
                  <Text style={styles.startBtnText}>Log Material</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={undefined}>
          {profile?.role_name === 'Site Supervisor' && (
            <TouchableOpacity
              style={[styles.photoUploadBtn, currentWeekPhotos.length >= 5 && { opacity: 0.5 }]}
              onPress={pickAndUploadSitePhoto}
              disabled={uploadingPhoto || currentWeekPhotos.length >= 5}
            >
              {uploadingPhoto
                ? <ActivityIndicator color="#c9a84c" />
                : <Text style={styles.photoUploadText}>📷 Add Photo ({currentWeekPhotos.length}/5 this week)</Text>}
            </TouchableOpacity>
          )}

          {weeks.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {weeks.map(w => (
                <TouchableOpacity
                  key={w}
                  style={[styles.weekChip, selectedWeek === w && styles.weekChipActive]}
                  onPress={() => setSelectedWeek(w)}
                >
                  <Text style={[styles.weekChipText, selectedWeek === w && styles.weekChipTextActive]}>
                    {w === currentWeekStart ? 'This Week' : formatWeekLabel(w)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {weekPhotos.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>📸</Text>
              <Text style={styles.emptyText}>No photos for this week yet</Text>
            </View>
          ) : (
            <FlatList
              data={weekPhotos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={i => i.id}
              renderItem={({ item }) => (
                <View style={{ width: SCREEN_WIDTH - 32 }}>
                  <Image source={{ uri: item.photo_url }} style={styles.sitePhoto} resizeMode="cover" />
                  {profile?.role_name === 'Site Supervisor' && (
                    <TouchableOpacity style={styles.photoDeleteBtn} onPress={() => deleteSitePhoto(item.id)}>
                      <Text style={{ color: '#e05c5c', fontWeight: '700' }}>✕ Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          )}
        </ScrollView>
      )}

      {/* Project Picker Modal */}
      <Modal visible={showProjectPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select Project</Text>
            {projects.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.projectOption, selectedProject?.id === p.id && styles.projectOptionActive]}
                onPress={() => selectProject(p)}
              >
                <Text style={[styles.projectOptionText, selectedProject?.id === p.id && { color: '#0d2818' }]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.closeBar} onPress={() => setShowProjectPicker(false)}>
              <Text style={styles.closeBarText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* New Log Overlay */}
      {showLogModal && (
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalKav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalCard}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>New Site Log</Text>

                <Text style={styles.label}>Date</Text>
                <TextInput style={styles.input} value={logDate} onChangeText={setLogDate} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" />

                <Text style={styles.label}>Weather</Text>
                <View style={styles.weatherRow}>
                  {WEATHER_OPTIONS.map(w => (
                    <TouchableOpacity key={w} style={[styles.weatherBtn, weather === w && styles.weatherBtnActive]} onPress={() => setWeather(w)}>
                      <Text style={[styles.weatherBtnText, weather === w && styles.weatherBtnTextActive]}>{w}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Activities *</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Describe work done today..."
                  placeholderTextColor="#4a7a54"
                  value={activities}
                  onChangeText={setActivities}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.label}>Workers Present, by Trade</Text>
                  <Text style={{ color: '#c9a84c', fontWeight: '700', fontSize: 13 }}>Total: {totalWorkers}</Text>
                </View>
                {workerRows.map((row, idx) => (
                  <View key={idx} style={styles.rowInputs}>
                    <TextInput
                      style={[styles.input, { flex: 1.5, marginBottom: 0 }]}
                      placeholder="Trade (e.g. Masons)"
                      placeholderTextColor="#4a7a54"
                      value={row.trade}
                      onChangeText={v => updateWorkerRow(idx, 'trade', v)}
                    />
                    <TextInput
                      style={[styles.input, { flex: 1, marginBottom: 0 }]}
                      placeholder="Count"
                      placeholderTextColor="#4a7a54"
                      value={row.count}
                      onChangeText={v => updateWorkerRow(idx, 'count', v)}
                      keyboardType="number-pad"
                    />
                    {workerRows.length > 1 && (
                      <TouchableOpacity onPress={() => removeWorkerRow(idx)} style={styles.rowRemoveBtn}>
                        <Text style={{ color: '#e05c5c', fontWeight: '700' }}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity onPress={addWorkerRow} style={styles.addRowBtn}>
                  <Text style={styles.addRowBtnText}>+ Add Trade</Text>
                </TouchableOpacity>

                <Text style={[styles.label, { marginTop: 16 }]}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Additional notes..."
                  placeholderTextColor="#4a7a54"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowLogModal(false); resetLogForm() }}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.submitBtn, submittingLog && { opacity: 0.6 }]} onPress={submitLog} disabled={submittingLog}>
                    {submittingLog ? <ActivityIndicator color="#0d2818" /> : <Text style={styles.submitBtnText}>Submit</Text>}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* New Material Overlay */}
      {showMaterialModal && (
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={styles.modalKav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.modalCard}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Log Material</Text>

                <View style={styles.modeToggleRow}>
                  {(['Usage', 'Delivery'] as const).map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.modeBtn, materialMode === m && styles.modeBtnActive]}
                      onPress={() => setMaterialMode(m)}
                    >
                      <Text style={[styles.modeBtnText, materialMode === m && styles.modeBtnTextActive]}>
                        {m === 'Delivery' ? '📦 Delivery Received' : '🔨 Usage'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>Date</Text>
                <TextInput style={styles.input} value={matDate} onChangeText={setMatDate} placeholder="YYYY-MM-DD" placeholderTextColor="#4a7a54" />

                {materialRows.map((row, idx) => (
                  <View key={idx} style={{ marginBottom: 12, backgroundColor: '#0d2818', borderRadius: 10, borderWidth: 1, borderColor: '#1e4d2b', padding: 12 }}>
                    <TextInput
                      style={[styles.input, { marginBottom: 8 }]}
                      placeholder="Material name (e.g. Cement)"
                      placeholderTextColor="#4a7a54"
                      value={row.name}
                      onChangeText={v => updateMaterialRow(idx, 'name', v)}
                    />
                    <View style={styles.rowInputs}>
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        placeholder="Qty"
                        placeholderTextColor="#4a7a54"
                        value={row.quantity}
                        onChangeText={v => updateMaterialRow(idx, 'quantity', v)}
                        keyboardType="numeric"
                      />
                      <TextInput
                        style={[styles.input, { flex: 1, marginBottom: 0 }]}
                        placeholder="Unit (bags, tons...)"
                        placeholderTextColor="#4a7a54"
                        value={row.unit}
                        onChangeText={v => updateMaterialRow(idx, 'unit', v)}
                      />
                      {materialRows.length > 1 && (
                        <TouchableOpacity onPress={() => removeMaterialRow(idx)} style={styles.rowRemoveBtn}>
                          <Text style={{ color: '#e05c5c', fontWeight: '700' }}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
                <TouchableOpacity onPress={addMaterialRow} style={styles.addRowBtn}>
                  <Text style={styles.addRowBtnText}>+ Add Material</Text>
                </TouchableOpacity>

                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowMaterialModal(false); resetMatForm() }}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
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
  tabRow: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#102e1a', borderRadius: 10, padding: 4 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#c9a84c' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#6b8f71' },
  tabTextActive: { color: '#0d2818' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#4a7a54', fontSize: 16, textAlign: 'center' },
  startBtn: { marginTop: 16, backgroundColor: '#c9a84c', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  startBtnText: { color: '#0d2818', fontWeight: '700' },
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
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 50 },
  modalKav: { flex: 1, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#102e1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 48, maxHeight: '92%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#c9a84c', marginBottom: 6 },
  input: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, padding: 12, fontSize: 14, color: '#ffffff', marginBottom: 16 },
  textarea: { height: 100 },
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
  sitePhoto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 12, backgroundColor: '#102e1a' },
  photoDeleteBtn: { alignSelf: 'center', marginTop: 10, backgroundColor: '#102e1a', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#2e1616' },
})