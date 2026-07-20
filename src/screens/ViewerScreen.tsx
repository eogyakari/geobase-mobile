import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, SafeAreaView, Image,
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
const BLUE  = '#64b5f6'

function statusConfig(s: string) {
  switch ((s ?? '').toLowerCase()) {
    case 'ongoing': return { color: GOLD, bg: GOLD + '22', label: 'In Progress' }
    case 'completed': return { color: GREEN, bg: GREEN + '22', label: 'Completed' }
    case 'delayed': return { color: RED, bg: RED + '22', label: 'Delayed' }
    default: return { color: MUTED, bg: MUTED + '22', label: 'Pending' }
  }
}

function initials(name = '') {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function ProgressBar({ value, color = GOLD }: { value: number; color?: string }) {
  return (
    <View style={{ width: '100%', height: 10, backgroundColor: BORD, borderRadius: 99 }}>
      <View style={{ height: '100%', width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color, borderRadius: 99 }} />
    </View>
  )
}

export default function ViewerScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [team, setTeam] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [photos, setPhotos] = useState<any[]>([])
  const [expandLog, setExpandLog] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase.from('profiles').select('id, full_name, email').eq('id', user.id).single()
      setProfile(prof)

      const { data: assignment } = await supabase
        .from('project_assignments')
        .select('project:projects!project_id(id, name, description, client, location, status, start_date, end_date, currency)')
        .eq('profile_id', user.id).limit(1).maybeSingle()

      const proj = (assignment as any)?.project
      setProject(proj ?? null)

      if (proj?.id) {
        const [teamRes, logRes, photoRes] = await Promise.all([
          supabase.from('sub_contractors').select('id, name, trade').eq('project_id', proj.id).order('trade'),
          supabase.from('site_logs').select('id, date, activities, workers_present, weather').eq('project_id', proj.id).order('date', { ascending: false }),
          supabase.from('site_photos').select('*').eq('project_id', proj.id).order('week_start', { ascending: false }).order('created_at', { ascending: true }).limit(10),
        ])
        setTeam(teamRes.data ?? [])
        setLogs(logRes.data ?? [])
        setPhotos(photoRes.data ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  const today = new Date()
  const start = project?.start_date ? new Date(project.start_date) : null
  const end = project?.end_date ? new Date(project.end_date) : null
  const total = start && end ? end.getTime() - start.getTime() : 0
  const elapsed = start ? today.getTime() - start.getTime() : 0
  const timelinePct = total > 0 ? Math.min(100, Math.max(0, Math.round((elapsed / total) * 100))) : 0
  const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86400000)) : null
  const timelineColor = timelinePct >= 90 ? RED : timelinePct >= 70 ? GOLD : GREEN
  const { color: stColor, bg: stBg, label: stLabel } = statusConfig(project?.status)

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={GOLD} size="large" />
      </SafeAreaView>
    )
  }

  if (!project) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Text style={{ color: GOLD, fontSize: 18 }}>‹</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>Your Project</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ fontSize: 40, marginBottom: 14 }}>🏗️</Text>
          <Text style={{ color: WHITE, fontWeight: '700', fontSize: 15, marginBottom: 6 }}>No project assigned yet</Text>
          <Text style={{ color: MUTED, fontSize: 13, textAlign: 'center' }}>Your project will appear here once it has been set up.</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Text style={{ color: GOLD, fontSize: 18 }}>‹</Text></TouchableOpacity>
        <View>
          <Text style={styles.headerEyebrow}>CLIENT PORTAL</Text>
          <Text style={styles.headerTitle}>Your Project</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        <View style={styles.welcomeBanner}>
          <Text style={styles.welcomeText}>Welcome, {profile?.full_name?.split(' ')[0]} 👋</Text>
          <Text style={styles.welcomeSub}>Here's a live update on your project progress.</Text>
        </View>

        <View style={styles.projectCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <Text style={styles.projectName}>{project.name}</Text>
            <View style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20, backgroundColor: stBg, borderWidth: 1, borderColor: stColor + '44' }}>
              <Text style={{ color: stColor, fontWeight: '700', fontSize: 11 }}>{stLabel}</Text>
            </View>
          </View>
          {project.description && <Text style={styles.projectDesc}>{project.description}</Text>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
            {project.client && <Text style={styles.metaText}>👤 {project.client}</Text>}
            {project.location && <Text style={styles.metaText}>📍 {project.location}</Text>}
          </View>

          <View style={styles.timelineBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ color: WHITE, fontWeight: '600', fontSize: 13 }}>📅 Project Timeline</Text>
              <Text style={{ color: timelineColor, fontWeight: '800', fontSize: 16 }}>{timelinePct}% elapsed</Text>
            </View>
            <ProgressBar value={timelinePct} color={timelineColor} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
              <View>
                <Text style={styles.miniLabel}>Start</Text>
                <Text style={styles.miniVal}>{start ? start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</Text>
              </View>
              {daysLeft !== null && (
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.miniLabel}>Days Remaining</Text>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: daysLeft === 0 ? RED : daysLeft <= 14 ? GOLD : GREEN }}>
                    {daysLeft === 0 ? 'Due today' : `${daysLeft} days`}
                  </Text>
                </View>
              )}
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.miniLabel}>End</Text>
                <Text style={styles.miniVal}>{end ? end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.statsRow}>
          {[
            { label: 'Site Team', val: team.length, color: GOLD },
            { label: 'Activity Logs', val: logs.length, color: BLUE },
            { label: 'Latest Update', val: logs[0]?.date ? new Date(logs[0].date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'None yet', color: GREEN },
          ].map(s => (
            <View key={s.label} style={styles.statCard}>
              <Text style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>{s.label}</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: s.color }}>{s.val}</Text>
            </View>
          ))}
        </View>

        {photos.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Site Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              {photos.map(p => (
                <Image key={p.id} source={{ uri: p.photo_url }} style={styles.photoThumb} resizeMode="cover" />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.cardTitle}>Site Team</Text>
            <Text style={{ marginLeft: 'auto', color: MUTED, fontSize: 11 }}>{team.length} members</Text>
          </View>
          {team.length === 0 ? (
            <Text style={styles.emptyText}>No team members on site yet.</Text>
          ) : team.map(m => (
            <View key={m.id} style={styles.teamRow}>
              <View style={styles.avatarCircle}><Text style={styles.avatarText}>{initials(m.name)}</Text></View>
              <View>
                <Text style={{ color: WHITE, fontWeight: '500', fontSize: 13 }}>{m.name}</Text>
                <View style={{ backgroundColor: BORD, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1, alignSelf: 'flex-start', marginTop: 3 }}>
                  <Text style={{ color: GOLD, fontSize: 10 }}>{m.trade ?? '—'}</Text>
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.chatBtn} onPress={() => navigation.navigate('Home', { screen: 'Chat' })}>
            <Text style={styles.chatBtnText}>💬 Message Project Team</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={styles.cardTitle}>Site Activity Log</Text>
            <Text style={{ marginLeft: 'auto', color: MUTED, fontSize: 11 }}>{logs.length} entries</Text>
          </View>
          {logs.length === 0 ? (
            <Text style={styles.emptyText}>No activity has been logged yet.</Text>
          ) : logs.map(log => {
            const isExpanded = expandLog === log.id
            const isToday = log.date === today.toISOString().split('T')[0]
            return (
              <TouchableOpacity key={log.id} style={styles.logRow} onPress={() => setExpandLog(isExpanded ? null : log.id)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <View style={[styles.dateDot, { backgroundColor: isToday ? GREEN : BORD }]} />
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.logDate}>{new Date(log.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                        {isToday && <View style={styles.todayPill}><Text style={{ color: GREEN, fontSize: 9, fontWeight: '700' }}>Today</Text></View>}
                      </View>
                      <Text style={styles.logMeta}>👷 {log.workers_present} workers {log.weather ? `· ⛅ ${log.weather}` : ''}</Text>
                    </View>
                  </View>
                  <Text style={{ color: MUTED, fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</Text>
                </View>
                {isExpanded && <Text style={styles.logActivities}>{log.activities}</Text>}
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>
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
  welcomeBanner: { backgroundColor: MID, borderWidth: 1, borderColor: GOLD + '33', borderRadius: 16, padding: 18, marginBottom: 14 },
  welcomeText: { fontSize: 18, fontWeight: '800', color: WHITE, marginBottom: 4 },
  welcomeSub: { fontSize: 12, color: MUTED },
  projectCard: { backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 16, padding: 18, marginBottom: 14 },
  projectName: { fontSize: 18, fontWeight: '800', color: WHITE, flex: 1, marginRight: 10 },
  projectDesc: { fontSize: 12, color: MUTED, lineHeight: 17, marginBottom: 10 },
  metaText: { fontSize: 12, color: MUTED },
  timelineBox: { backgroundColor: DARK, borderRadius: 12, padding: 14 },
  miniLabel: { fontSize: 9, color: MUTED, marginBottom: 2 },
  miniVal: { fontSize: 11, fontWeight: '600', color: WHITE },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 12, padding: 12 },
  card: { backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: WHITE },
  emptyText: { color: MUTED, fontSize: 12, textAlign: 'center', paddingVertical: 20 },
  photoThumb: { width: 130, height: 100, borderRadius: 10, marginRight: 10, backgroundColor: DARK },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#1a2a1e' },
  avatarCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: BORD, borderWidth: 1, borderColor: '#2a4030', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: GOLD, fontSize: 11, fontWeight: '700' },
  chatBtn: { marginTop: 14, borderWidth: 1, borderColor: GOLD + '44', backgroundColor: GOLD + '18', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  chatBtnText: { color: GOLD, fontWeight: '700', fontSize: 13 },
  logRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#1a2a1e' },
  dateDot: { width: 8, height: 8, borderRadius: 4 },
  logDate: { color: WHITE, fontWeight: '600', fontSize: 13 },
  logMeta: { color: MUTED, fontSize: 11, marginTop: 3 },
  todayPill: { backgroundColor: GREEN + '22', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  logActivities: { color: '#c0b898', fontSize: 12, lineHeight: 18, marginTop: 10, marginLeft: 18 },
})