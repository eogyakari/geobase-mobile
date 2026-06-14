import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, SafeAreaView,
} from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { supabase } from '../lib/supabase'
import RequestsScreen from './RequestsScreen'
import NotificationsScreen from './NotificationsScreen'
import ChatScreen from './ChatScreen'
import SiteLogScreen from './SiteLogScreen'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback } from 'react'
import ProfileScreen from './ProfileScreen'

const Tab = createBottomTabNavigator()

function DashboardTab({ profile, navigation }: { profile: any; navigation: any }) {
  const [stats, setStats] = useState({ projects: 0, requests: 0, notifications: 0 })

  useFocusEffect(useCallback(() => {
    if (!profile) return
    const load = async () => {
      const [{ count: pCount }, { count: rCount }, { count: nCount }] = await Promise.all([
        supabase.from('projects').select('*', { count: 'exact', head: true })
          .eq('organization_id', profile.organization_id),
        supabase.from('requests').select('*', { count: 'exact', head: true })
          .eq('organization_id', profile.organization_id).eq('status', 'pending'),
        supabase.from('notifications').select('*', { count: 'exact', head: true })
          .eq('user_id', profile.id).eq('is_read', false),
      ])
      setStats({ projects: pCount ?? 0, requests: rCount ?? 0, notifications: nCount ?? 0 })
    }
    load()
  load()
}, [profile]))

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.dashScroll} contentContainerStyle={styles.dashContent}>
        <View style={styles.dashHeader}>
          <View>
            <Text style={styles.greeting}>Good day,</Text>
            <Text style={styles.userName}>{profile?.full_name ?? 'User'}</Text>
            <Text style={styles.userRole}>{profile?.role_name ?? ''}</Text>
          </View>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {(profile?.full_name ?? 'U').charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderTopColor: '#c9a84c' }]}>
            <Text style={styles.statNum}>{stats.projects}</Text>
            <Text style={styles.statLabel}>Projects</Text>
          </View>
          <View style={[styles.statCard, { borderTopColor: '#4caf82' }]}>
            <Text style={styles.statNum}>{stats.requests}</Text>
            <Text style={styles.statLabel}>{'Pending\nRequests'}</Text>
          </View>
          <View style={[styles.statCard, { borderTopColor: '#e05c5c' }]}>
            <Text style={styles.statNum}>{stats.notifications}</Text>
            <Text style={styles.statLabel}>Unread</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {[
  { label: 'New Request', icon: '📋', tab: 'Requests' },
  { label: 'Site Log', icon: '🏗️', tab: 'Site Log' },
  { label: 'Chat', icon: '💬', tab: 'Chat' },
  { label: 'Notifications', icon: '🔔', tab: 'Notifications' },
  { label: 'Profile', icon: '👤', tab: 'Profile' },
].map((a) => (
  <TouchableOpacity
    key={a.label}
    style={styles.actionCard}
    onPress={() => navigation.navigate(a.tab)}
  >
    <Text style={styles.actionIcon}>{a.icon}</Text>
    <Text style={styles.actionLabel}>{a.label}</Text>
  </TouchableOpacity>
))}
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

export default function HomeScreen() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notifCount, setNotifCount] = useState(0)

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('*, roles(name)')
        .eq('id', user.id)
        .single()
      if (data) setProfile({ ...data, role_name: data.roles?.name ?? '' })

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false)
      setNotifCount(count ?? 0)
    } finally {
      setLoading(false)
    }
  }

  useFocusEffect(useCallback(() => { loadProfile() }, []))

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#c9a84c" size="large" />
      </View>
    )
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#c9a84c',
        tabBarInactiveTintColor: '#4a7a54',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text> }}
      >
        {(props) => <DashboardTab profile={profile} navigation={props.navigation} />}

      </Tab.Screen>
      <Tab.Screen
        name="Requests"
        options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📋</Text> }}
      >
        {() => <RequestsScreen />}
      </Tab.Screen>
      <Tab.Screen
        name="Chat"
        options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💬</Text> }}
      >
        {() => <ChatScreen />}
      </Tab.Screen>
      <Tab.Screen
        name="Notifications"
        options={{
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🔔</Text>,
          tabBarBadge: notifCount > 0 ? notifCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#e05c5c', fontSize: 10 },
        }}
      >
        {() => <NotificationsScreen />}
      </Tab.Screen>
      <Tab.Screen
        name="Site Log"
        options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏗️</Text> }}
      >
        {() => <SiteLogScreen />}
      </Tab.Screen>
      <Tab.Screen
  name="Profile"
  options={{ tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text> }}
>
  {() => <ProfileScreen />}
</Tab.Screen>
    </Tab.Navigator>
  )
} 


const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0d2818' },
  loadingContainer: { flex: 1, backgroundColor: '#0d2818', justifyContent: 'center', alignItems: 'center' },
  dashScroll: { flex: 1, backgroundColor: '#0d2818' },
  dashContent: { padding: 20, paddingBottom: 40 },
  dashHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  greeting: { fontSize: 13, color: '#6b8f71' },
  userName: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  userRole: { fontSize: 12, color: '#c9a84c', marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
  avatarCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#c9a84c', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '800', color: '#0d2818' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6b8f71', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  statCard: { flex: 1, backgroundColor: '#102e1a', borderRadius: 12, padding: 14, borderTopWidth: 3, alignItems: 'center' },
  statNum: { fontSize: 26, fontWeight: '800', color: '#ffffff' },
  statLabel: { fontSize: 11, color: '#6b8f71', marginTop: 4, textAlign: 'center' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 32 },
  actionCard: { width: '47%', backgroundColor: '#102e1a', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1e4d2b' },
  actionIcon: { fontSize: 28, marginBottom: 8 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: '#ffffff' },
  signOutBtn: { borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  signOutText: { color: '#e05c5c', fontWeight: '600' },
  tabBar: { backgroundColor: '#102e1a', borderTopColor: '#1e4d2b', borderTopWidth: 1, height: 62, paddingBottom: 8 },
})