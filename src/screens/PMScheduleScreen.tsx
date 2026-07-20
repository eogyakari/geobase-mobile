import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, SafeAreaView,
  Modal, TextInput, Alert,
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

const CATEGORIES = ['Foundation', 'Structure', 'Roofing', 'Electrical', 'Plumbing', 'Finishing', 'Earthworks', 'Concrete', 'Carpentry', 'General']
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

function getWeekRange(date: Date) {
  const d = new Date(date)
  const day = d.getDay() || 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - day + 1)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  return { mon, sun }
}
function fmtDate(d: Date) { return d.toISOString().split('T')[0] }
function fmtLabel(d: Date) { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }

export default function PMScheduleScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [siteSups, setSiteSups] = useState<any[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [weekDate, setWeekDate] = useState(new Date())
  const [activeSchedule, setActiveSchedule] = useState<any>(null)
  const [tasks, setTasks] = useState<any[]>([])
  const [flaggedTasks, setFlaggedTasks] = useState<any[]>([])
  const [showProjectPicker, setShowProjectPicker] = useState(false)

  const [showTaskModal, setShowTaskModal] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [taskCategory, setTaskCategory] = useState('General')
  const [taskPriority, setTaskPriority] = useState('Medium')
  const [taskStart, setTaskStart] = useState('')
  const [taskEnd, setTaskEnd] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [showAssigneePicker, setShowAssigneePicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submittingSchedule, setSubmittingSchedule] = useState(false)

  const { mon, sun } = getWeekRange(weekDate)
  const weekStart = fmtDate(mon)
  const weekEnd = fmtDate(sun)
  const isSubmitted = activeSchedule?.status === 'submitted'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase.from('profiles').select('id, full_name, organization_id').eq('id', user.id).single()
      setProfile(prof)

      const [p, sup] = await Promise.all([
        supabase.from('project_assignments').select('project:projects!project_id(id, name)').eq('profile_id', user.id),
        supabase.from('profiles').select('id, full_name, role:roles!role_id(name)').eq('organization_id', prof?.organization_id).not('role_id', 'is', null),
      ])
      const projList = (p.data ?? []).map((a: any) => a.project).filter(Boolean)
      setProjects(projList)
      if (projList.length > 0) setSelectedProjectId(projList[0].id)

      setSiteSups((sup.data ?? []).filter((u: any) => u.role?.name === 'Site Supervisor'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedProjectId) { loadSchedule(); loadFlagged() }
  }, [selectedProjectId, weekDate])

  const loadSchedule = async () => {
    const { data: sched } = await supabase.from('project_schedules')
      .select('*').eq('project_id', selectedProjectId).eq('week_start', weekStart).maybeSingle()
    setActiveSchedule(sched ?? null)
    if (sched) {
      const { data } = await supabase.from('schedule_tasks')
        .select('*, assignee:profiles!assigned_to(full_name)').eq('schedule_id', sched.id).order('start_date')
      setTasks(data ?? [])
    } else {
      setTasks([])
    }
  }

  const loadFlagged = async () => {
    const { data } = await supabase.from('schedule_tasks')
      .select('*, assignee:profiles!assigned_to(full_name), schedule:project_schedules!schedule_id(title, project_id)')
      .in('status', ['partial', 'suspended']).order('start_date')
    setFlaggedTasks((data ?? []).filter((t: any) => t.schedule?.project_id === selectedProjectId))
  }

  const getOrCreateSchedule = async () => {
    if (activeSchedule) return activeSchedule
    const proj = projects.find(p => p.id === selectedProjectId)
    const { data, error } = await supabase.from('project_schedules').insert({
      project_id: selectedProjectId, week_start: weekStart, week_end: weekEnd,
      title: `Week of ${fmtLabel(mon)} — ${proj?.name}`, created_by: profile?.id, status: 'draft',
    }).select().single()
    if (error) { Alert.alert('Error', error.message); return null }
    setActiveSchedule(data)
    return data
  }

  const openAddTask = () => {
    setTaskTitle(''); setTaskCategory('General'); setTaskPriority('Medium')
    setTaskStart(weekStart); setTaskEnd(weekStart); setTaskAssignee('')
    setShowTaskModal(true)
  }

  const handleAddTask = async () => {
    if (!taskTitle.trim()) { Alert.alert('Required', 'Task title is required.'); return }
    if (!taskStart || !taskEnd) { Alert.alert('Required', 'Start and end dates are required.'); return }
    let sched = activeSchedule
    if (!sched) { sched = await getOrCreateSchedule(); if (!sched) return }

    setSaving(true)
    try {
      const { error } = await supabase.from('schedule_tasks').insert({
        schedule_id: sched.id, project_id: selectedProjectId,
        title: taskTitle.trim(), category: taskCategory, priority: taskPriority,
        start_date: taskStart, end_date: taskEnd,
        assigned_to: taskAssignee || null, status: 'pending',
      })
      if (error) { Alert.alert('Error', error.message); return }
      setShowTaskModal(false)
      await loadSchedule()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTask = async (id: string) => {
    await supabase.from('schedule_tasks').delete().eq('id', id)
    await loadSchedule()
  }

  const handleSubmitSchedule = async () => {
    if (!activeSchedule) return
    if (tasks.length === 0) { Alert.alert('No Tasks', 'Add at least one task before submitting.'); return }
    setSubmittingSchedule(true)
    try {
      await supabase.from('project_schedules').update({ status: 'submitted' }).eq('id', activeSchedule.id)
      const assignees = [...new Set(tasks.map(t => t.assigned_to).filter(Boolean))]
      if (assignees.length > 0) {
        await supabase.from('notifications').insert(
          assignees.map(id => ({
            recipient_id: id, title: 'New Weekly Schedule',
            message: `${activeSchedule.title} has been submitted. You have ${tasks.filter(t => t.assigned_to === id).length} task(s) assigned.`,
            requested_by: profile?.id, is_read: false,
          }))
        )
      }
      setActiveSchedule({ ...activeSchedule, status: 'submitted' })
      Alert.alert('Success', 'Schedule submitted! Site supervisor(s) notified.')
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setSubmittingSchedule(false)
    }
  }

  const shiftWeek = (dir: number) => {
    const d = new Date(weekDate)
    d.setDate(d.getDate() + dir * 7)
    setWeekDate(d)
  }

  const selectedProjectName = projects.find(p => p.id === selectedProjectId)?.name ?? 'Select project'

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
          <Text style={styles.headerEyebrow}>GEOBASE · SCHEDULING</Text>
          <Text style={styles.headerTitle}>Weekly Schedule</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        <TouchableOpacity style={styles.selectorBtn} onPress={() => setShowProjectPicker(true)}>
          <Text style={styles.selectorText}>{selectedProjectName}</Text>
          <Text style={{ color: MUTED, fontSize: 12 }}>▾</Text>
        </TouchableOpacity>

        <View style={styles.weekNav}>
          <TouchableOpacity onPress={() => shiftWeek(-1)} style={styles.weekNavBtn}><Text style={styles.weekNavArrow}>‹</Text></TouchableOpacity>
          <Text style={styles.weekLabel}>{fmtLabel(mon)} — {fmtLabel(sun)}</Text>
          <TouchableOpacity onPress={() => shiftWeek(1)} style={styles.weekNavBtn}><Text style={styles.weekNavArrow}>›</Text></TouchableOpacity>
        </View>

        {activeSchedule && (
          <View style={[styles.statusBadge, { backgroundColor: isSubmitted ? GREEN + '22' : GOLD + '22', borderColor: isSubmitted ? GREEN + '44' : GOLD + '44' }]}>
            <Text style={{ color: isSubmitted ? GREEN : GOLD, fontWeight: '700', fontSize: 11 }}>{isSubmitted ? '✓ Submitted' : 'Draft'}</Text>
          </View>
        )}

        {flaggedTasks.length > 0 && (
          <View style={styles.flaggedBox}>
            <Text style={styles.flaggedTitle}>⚠ Needs Attention ({flaggedTasks.length})</Text>
            <Text style={styles.flaggedSub}>Shown regardless of which week is selected above</Text>
            {flaggedTasks.map(task => {
              const isSuspended = task.status === 'suspended'
              return (
                <View key={task.id} style={styles.flaggedTaskRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <Text style={styles.flaggedTaskTitle}>{task.title}</Text>
                    <View style={[styles.pill, { backgroundColor: isSuspended ? RED + '22' : GOLD + '22' }]}>
                      <Text style={[styles.pillText, { color: isSuspended ? RED : GOLD }]}>{isSuspended ? 'Suspended' : 'Partial'}</Text>
                    </View>
                  </View>
                  {task.reason_category && (
                    <Text style={styles.flaggedReason}>Reason: {task.reason_category}{task.reason_notes ? ` — ${task.reason_notes}` : ''}</Text>
                  )}
                  {task.assignee && <Text style={styles.flaggedReason}>{task.assignee.full_name}</Text>}
                </View>
              )
            })}
          </View>
        )}

        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={styles.cardTitle}>Tasks This Week ({tasks.length})</Text>
            {!isSubmitted && (
              <TouchableOpacity onPress={openAddTask} style={styles.addTaskBtn}>
                <Text style={styles.addTaskBtnText}>+ Add Task</Text>
              </TouchableOpacity>
            )}
          </View>

          {tasks.length === 0 ? (
            <Text style={styles.emptyText}>No tasks yet for this week.</Text>
          ) : tasks.map(task => {
            const priColor = task.priority === 'Critical' ? RED : task.priority === 'High' ? '#ef8c35' : task.priority === 'Low' ? MUTED : GOLD
            const isDone = task.status === 'completed'
            return (
              <View key={task.id} style={[styles.taskRow, isDone && { opacity: 0.6 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.taskTitle, isDone && { textDecorationLine: 'line-through' }]}>{task.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Text style={{ color: priColor, fontSize: 11 }}>● {task.priority}</Text>
                    <Text style={styles.taskMeta}>{task.category}</Text>
                    {task.assignee && <Text style={styles.taskMeta}>· {task.assignee.full_name}</Text>}
                  </View>
                </View>
                {!isSubmitted && (
                  <TouchableOpacity onPress={() => handleDeleteTask(task.id)} style={styles.deleteBtn}>
                    <Text style={{ color: RED, fontSize: 16 }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            )
          })}
        </View>

        {activeSchedule && !isSubmitted && tasks.length > 0 && (
          <TouchableOpacity onPress={handleSubmitSchedule} disabled={submittingSchedule} style={styles.submitScheduleBtn}>
            {submittingSchedule ? <ActivityIndicator color={DARK} /> : <Text style={styles.submitScheduleBtnText}>Submit Schedule</Text>}
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Project picker */}
      <Modal visible={showProjectPicker} animationType="slide" transparent onRequestClose={() => setShowProjectPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowProjectPicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.modalTitle}>Select Project</Text>
            <ScrollView>
              {projects.map(p => (
                <TouchableOpacity key={p.id} style={styles.pickerRow} onPress={() => { setSelectedProjectId(p.id); setShowProjectPicker(false) }}>
                  <Text style={[styles.pickerRowText, p.id === selectedProjectId && { color: GOLD, fontWeight: '700' }]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Task modal */}
      <Modal visible={showTaskModal} animationType="slide" transparent onRequestClose={() => setShowTaskModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.taskModalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Add Task</Text>

              <Text style={styles.label}>Task Title *</Text>
              <TextInput style={styles.input} value={taskTitle} onChangeText={setTaskTitle} placeholder="e.g. Pour concrete — Block A" placeholderTextColor="#4a7a54" />

              <Text style={styles.label}>Category</Text>
              <TouchableOpacity style={styles.pickerField} onPress={() => setShowCategoryPicker(true)}>
                <Text style={{ color: WHITE }}>{taskCategory}</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Priority</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                {PRIORITIES.map(p => (
                  <TouchableOpacity key={p} style={[styles.priorityChip, taskPriority === p && styles.priorityChipActive]} onPress={() => setTaskPriority(p)}>
                    <Text style={[styles.priorityChipText, taskPriority === p && styles.priorityChipTextActive]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Start Date * (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} value={taskStart} onChangeText={setTaskStart} placeholder={weekStart} placeholderTextColor="#4a7a54" />

              <Text style={styles.label}>End Date * (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} value={taskEnd} onChangeText={setTaskEnd} placeholder={weekEnd} placeholderTextColor="#4a7a54" />

              <Text style={styles.label}>Assign to Site Supervisor</Text>
              <TouchableOpacity style={styles.pickerField} onPress={() => setShowAssigneePicker(true)}>
                <Text style={{ color: taskAssignee ? WHITE : '#4a7a54' }}>
                  {taskAssignee ? siteSups.find(s => s.id === taskAssignee)?.full_name : 'Unassigned'}
                </Text>
              </TouchableOpacity>

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTaskModal(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleAddTask} disabled={saving}>
                  {saving ? <ActivityIndicator color={DARK} /> : <Text style={styles.saveBtnText}>Add Task</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Category picker */}
      <Modal visible={showCategoryPicker} animationType="slide" transparent onRequestClose={() => setShowCategoryPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCategoryPicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.modalTitle}>Category</Text>
            <ScrollView>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={styles.pickerRow} onPress={() => { setTaskCategory(c); setShowCategoryPicker(false) }}>
                  <Text style={[styles.pickerRowText, c === taskCategory && { color: GOLD, fontWeight: '700' }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Assignee picker */}
      <Modal visible={showAssigneePicker} animationType="slide" transparent onRequestClose={() => setShowAssigneePicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAssigneePicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.modalTitle}>Assign to Site Supervisor</Text>
            <ScrollView>
              <TouchableOpacity style={styles.pickerRow} onPress={() => { setTaskAssignee(''); setShowAssigneePicker(false) }}>
                <Text style={styles.pickerRowText}>— Unassigned —</Text>
              </TouchableOpacity>
              {siteSups.map(s => (
                <TouchableOpacity key={s.id} style={styles.pickerRow} onPress={() => { setTaskAssignee(s.id); setShowAssigneePicker(false) }}>
                  <Text style={[styles.pickerRowText, s.id === taskAssignee && { color: GOLD, fontWeight: '700' }]}>{s.full_name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
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
  scrollContent: { padding: 16, paddingBottom: 40 },
  selectorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 12 },
  selectorText: { color: WHITE, fontSize: 14, fontWeight: '600' },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 12 },
  weekNavBtn: { padding: 6 },
  weekNavArrow: { color: MUTED, fontSize: 20 },
  weekLabel: { color: WHITE, fontSize: 14, fontWeight: '700' },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20, borderWidth: 1, marginBottom: 14 },
  flaggedBox: { backgroundColor: '#2e1a0e', borderWidth: 1, borderColor: '#ef8c3544', borderRadius: 14, padding: 16, marginBottom: 16 },
  flaggedTitle: { color: '#ef8c35', fontWeight: '800', fontSize: 13, marginBottom: 2 },
  flaggedSub: { color: '#c0b898', fontSize: 10, marginBottom: 10 },
  flaggedTaskRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#3a2510' },
  flaggedTaskTitle: { color: WHITE, fontWeight: '600', fontSize: 13 },
  flaggedReason: { color: '#c0b898', fontSize: 11, marginTop: 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  pillText: { fontSize: 9, fontWeight: '700' },
  card: { backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 14, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: WHITE },
  emptyText: { fontSize: 13, color: MUTED, textAlign: 'center', paddingVertical: 20 },
  addTaskBtn: { backgroundColor: GOLD + '18', borderWidth: 1, borderColor: GOLD + '44', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addTaskBtnText: { color: GOLD, fontWeight: '700', fontSize: 12 },
  taskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#1a2a1e' },
  taskTitle: { fontSize: 13, fontWeight: '600', color: WHITE },
  taskMeta: { fontSize: 11, color: MUTED },
  deleteBtn: { padding: 8 },
  submitScheduleBtn: { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitScheduleBtnText: { color: DARK, fontWeight: '800', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: MID, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  taskModalSheet: { backgroundColor: MID, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '90%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: WHITE, marginBottom: 16 },
  pickerRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#1a2a1e' },
  pickerRowText: { fontSize: 14, color: WHITE },
  label: { fontSize: 12, fontWeight: '600', color: GOLD, marginBottom: 6, marginTop: 4 },
  input: { backgroundColor: DARK, borderWidth: 1, borderColor: BORD, borderRadius: 10, padding: 12, fontSize: 14, color: WHITE, marginBottom: 8 },
  pickerField: { backgroundColor: DARK, borderWidth: 1, borderColor: BORD, borderRadius: 10, padding: 13, marginBottom: 8 },
  priorityChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: BORD },
  priorityChipActive: { backgroundColor: GOLD, borderColor: GOLD },
  priorityChipText: { fontSize: 12, color: MUTED, fontWeight: '600' },
  priorityChipTextActive: { color: DARK },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 24 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: BORD, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  cancelBtnText: { color: MUTED, fontWeight: '600' },
  saveBtn: { flex: 1, backgroundColor: GOLD, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: DARK, fontWeight: '700', fontSize: 14 },
})