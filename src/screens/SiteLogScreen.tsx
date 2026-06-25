import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform, Alert, FlatList,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'

type Project = { id: string; name: string }
type SiteLog = {
  id: string
  date: string
  activities: string
  workers_present: number
  weather: string
  notes: string
  created_at: string
}
type SiteMaterial = {
  id: string
  name: string
  quantity: number
  unit: string
  cost: number
  date: string
}

const WEATHER_OPTIONS = ['Sunny', 'Cloudy', 'Rainy', 'Windy', 'Stormy']

export default function SiteLogScreen() {
  const [profile, setProfile] = useState<any>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [logs, setLogs] = useState<SiteLog[]>([])
  const [materials, setMaterials] = useState<SiteMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'logs' | 'materials'>('logs')
  const [showProjectPicker, setShowProjectPicker] = useState(false)

  // Log form
  const [showLogModal, setShowLogModal] = useState(false)
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0])
  const [activities, setActivities] = useState('')
  const [workers, setWorkers] = useState('')
  const [weather, setWeather] = useState('Sunny')
  const [notes, setNotes] = useState('')
  const [submittingLog, setSubmittingLog] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false) 

  // Material form
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [matName, setMatName] = useState('')
  const [matQty, setMatQty] = useState('')
  const [matUnit, setMatUnit] = useState('')
  const [matCost, setMatCost] = useState('')
  const [matDate, setMatDate] = useState(new Date().toISOString().split('T')[0])
  const [submittingMat, setSubmittingMat] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await supabase
        .from('profiles').select('*, roles(name)').eq('id', user.id).single()
      setProfile({ ...prof, role_name: prof?.roles?.name ?? '' })

      // Get assigned projects
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
    const [{ data: logsData }, { data: matsData }] = await Promise.all([
      supabase.from('site_logs').select('*').eq('project_id', projectId).order('date', { ascending: false }),
      supabase.from('site_materials').select('*').eq('project_id', projectId).order('date', { ascending: false }),
    ])
    setLogs(logsData ?? [])
    setMaterials(matsData ?? [])
  }

  useFocusEffect(useCallback(() => { loadData() }, []))

  const selectProject = async (project: Project) => {
    setSelectedProject(project)
    setShowProjectPicker(false)
    setLoading(true)
    await loadProjectData(project.id)
    setLoading(false)
  }

  const submitLog = async () => {
    if (!activities.trim()) return Alert.alert('Required', 'Please enter activities')
    if (!selectedProject) return Alert.alert('Required', 'Please select a project')
    try {
      setSubmittingLog(true)
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('site_logs').insert({
        project_id: selectedProject.id,
        supervisor_id: user!.id,
        date: logDate,
        activities: activities.trim(),
        workers_present: workers ? parseInt(workers) : null,
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

  const submitMaterial = async () => {
    if (!matName.trim()) return Alert.alert('Required', 'Please enter material name')
    if (!selectedProject) return Alert.alert('Required', 'Please select a project')
    try {
      setSubmittingMat(true)
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('site_materials').insert({
        project_id: selectedProject.id,
        logged_by: user!.id,
        name: matName.trim(),
        quantity: matQty ? parseFloat(matQty) : null,
        unit: matUnit.trim() || null,
        cost: matCost ? parseFloat(matCost) : null,
        date: matDate,
        photos: photos.length > 0 ? photos : null,
      })
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
    setWorkers('')
    setWeather('Sunny')
    setNotes('')
    setPhotos([])
  }

  const resetMatForm = () => {
    setMatName('')
    setMatQty('')
    setMatUnit('')
    setMatCost('')
    setMatDate(new Date().toISOString().split('T')[0])
  }

  const pickAndUploadPhoto = async () => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) {
    Alert.alert('Permission needed', 'Please allow access to your photo library')
    return
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: true,
    quality: 0.7,
  })

  if (result.canceled) return

  try {
    setUploadingPhoto(true)
    const uploadedUrls: string[] = []

    for (const asset of result.assets) {
      const ext = asset.uri.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        name: fileName,
        type: `image/${ext}`,
      } as any)

      const { data, error } = await supabase.storage
        .from('site-logs')
        .upload(fileName, formData, { contentType: 'multipart/form-data' })

      if (!error && data) {
        const { data: urlData } = supabase.storage.from('site-logs').getPublicUrl(data.path)
        uploadedUrls.push(urlData.publicUrl)
      }
    }

    setPhotos(prev => [...prev, ...uploadedUrls])
  } catch (e: any) {
    Alert.alert('Upload Error', e.message)
  } finally {
    setUploadingPhoto(false)
  }
}

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
      {item.workers_present && (
        <>
          <Text style={styles.cardLabel}>Workers Present</Text>
          <Text style={styles.cardValue}>{item.workers_present}</Text>
        </>
      )}
      {item.notes && (
        <>
          <Text style={styles.cardLabel}>Notes</Text>
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
        {item.quantity && <View style={styles.matChip}><Text style={styles.matChipText}>Qty: {item.quantity} {item.unit ?? ''}</Text></View>}
        {item.cost && <View style={[styles.matChip, { borderColor: '#4caf82' }]}><Text style={[styles.matChipText, { color: '#4caf82' }]}>GHS {item.cost.toLocaleString()}</Text></View>}
      </View>
    </View>
  )

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
  <Text style={styles.headerTitle}>Site Log</Text>
  {profile?.role_name === 'Site Supervisor' && (
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
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'logs' && styles.tabBtnActive]}
          onPress={() => setActiveTab('logs')}
        >
          <Text style={[styles.tabText, activeTab === 'logs' && styles.tabTextActive]}>
            Daily Logs {logs.length > 0 ? `(${logs.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'materials' && styles.tabBtnActive]}
          onPress={() => setActiveTab('materials')}
        >
          <Text style={[styles.tabText, activeTab === 'materials' && styles.tabTextActive]}>
            Materials {materials.length > 0 ? `(${materials.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
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
      ) : (
        <FlatList
          data={materials}
          keyExtractor={i => i.id}
          renderItem={renderMaterial}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          onRefresh={() => selectedProject && loadProjectData(selectedProject.id)}
          refreshing={loading}
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
          <KeyboardAvoidingView
            style={styles.modalKav}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCard}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>New Site Log</Text>

                <Text style={styles.label}>Date</Text>
                <TextInput
                  style={styles.input}
                  value={logDate}
                  onChangeText={setLogDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#4a7a54"
                />

                <Text style={styles.label}>Weather</Text>
                <View style={styles.weatherRow}>
                  {WEATHER_OPTIONS.map(w => (
                    <TouchableOpacity
                      key={w}
                      style={[styles.weatherBtn, weather === w && styles.weatherBtnActive]}
                      onPress={() => setWeather(w)}
                    >
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

                <Text style={styles.label}>Workers Present</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Number of workers"
                  placeholderTextColor="#4a7a54"
                  value={workers}
                  onChangeText={setWorkers}
                  keyboardType="number-pad"
                />

                <Text style={styles.label}>Notes</Text>
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

                <Text style={styles.label}>Site Photos</Text>
                <TouchableOpacity
                  style={styles.photoUploadBtn}
                  onPress={pickAndUploadPhoto}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto
                    ? <ActivityIndicator color="#c9a84c" />
                    : <Text style={styles.photoUploadText}>📷 Add Photos</Text>}
                </TouchableOpacity>
                {photos.length > 0 && (
                  <View style={styles.photoPreviewRow}>
                    {photos.map((url, i) => (
                      <View key={i} style={styles.photoPreview}>
                        <Text style={styles.photoPreviewText}>📸 Photo {i + 1}</Text>
                        <TouchableOpacity onPress={() => setPhotos(prev => prev.filter((_, j) => j !== i))}>
                          <Text style={styles.photoRemove}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowLogModal(false); resetLogForm() }}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitBtn, submittingLog && { opacity: 0.6 }]}
                    onPress={submitLog}
                    disabled={submittingLog}
                  >
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
          <KeyboardAvoidingView
            style={styles.modalKav}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View style={styles.modalCard}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Log Material</Text>

                <Text style={styles.label}>Date</Text>
                <TextInput
                  style={styles.input}
                  value={matDate}
                  onChangeText={setMatDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#4a7a54"
                />

                <Text style={styles.label}>Material Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Cement, Steel rods..."
                  placeholderTextColor="#4a7a54"
                  value={matName}
                  onChangeText={setMatName}
                />

                <View style={styles.rowInputs}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Quantity</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      placeholderTextColor="#4a7a54"
                      value={matQty}
                      onChangeText={setMatQty}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Unit</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="bags, tonnes..."
                      placeholderTextColor="#4a7a54"
                      value={matUnit}
                      onChangeText={setMatUnit}
                    />
                  </View>
                </View>

                <Text style={styles.label}>Cost (GHS)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor="#4a7a54"
                  value={matCost}
                  onChangeText={setMatCost}
                  keyboardType="numeric"
                />

                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowMaterialModal(false); resetMatForm() }}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitBtn, submittingMat && { opacity: 0.6 }]}
                    onPress={submitMaterial}
                    disabled={submittingMat}
                  >
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
  tabText: { fontSize: 13, fontWeight: '600', color: '#6b8f71' },
  tabTextActive: { color: '#0d2818' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#4a7a54', fontSize: 16, textAlign: 'center' },
  startBtn: { marginTop: 16, backgroundColor: '#c9a84c', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  startBtnText: { color: '#0d2818', fontWeight: '700' },
  card: { backgroundColor: '#102e1a', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1e4d2b' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#ffffff', flex: 1 },
  cardDate: { fontSize: 13, color: '#c9a84c', fontWeight: '600' },
  cardLabel: { fontSize: 11, color: '#6b8f71', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  cardValue: { fontSize: 14, color: '#ffffff', marginBottom: 10, lineHeight: 20 },
  weatherBadge: { backgroundColor: '#1e4d2b', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  weatherText: { fontSize: 12, color: '#c9a84c', fontWeight: '600' },
  matRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  matChip: { borderWidth: 1, borderColor: '#c9a84c', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  matChipText: { fontSize: 12, color: '#c9a84c', fontWeight: '600' },
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
  input: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, padding: 12, fontSize: 14, color: '#ffffff', marginBottom: 16 },
  textarea: { height: 100 },
  weatherRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  weatherBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#1e4d2b' },
  weatherBtnActive: { backgroundColor: '#c9a84c', borderColor: '#c9a84c' },
  weatherBtnText: { fontSize: 12, color: '#6b8f71', fontWeight: '600' },
  weatherBtnTextActive: { color: '#0d2818' },
  rowInputs: { flexDirection: 'row', gap: 12 },
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
  photoUploadBtn: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#c9a84c', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 16, borderStyle: 'dashed' },
photoUploadText: { color: '#c9a84c', fontWeight: '600', fontSize: 14 },
photoPreviewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
photoPreview: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0d2818', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#1e4d2b' },
photoPreviewText: { color: '#ffffff', fontSize: 12 },
photoRemove: { color: '#e05c5c', fontSize: 14, fontWeight: '700' },
})