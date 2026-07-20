import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'

const GOLD = '#c9a84c'
const DARK = '#0a1209'
const MID  = '#152019'
const BORD = '#1e3320'
const WHITE = '#e8e0d0'
const MUTED = '#8a9e8d'

const LANDING_URL = 'https://geobase.tech'

export default function LandingPageScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: GOLD, fontSize: 18 }}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About Geobase</Text>
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 32, marginBottom: 12 }}>📡</Text>
          <Text style={styles.errorText}>Couldn't load the page. Check your connection and try again.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setError(false); setLoading(true) }}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            source={{ uri: LANDING_URL }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true) }}
            startInLoadingState={false}
          />
          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={GOLD} size="large" />
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: DARK },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORD },
  backBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: MID, borderWidth: 1, borderColor: BORD, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: WHITE },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  errorText: { color: MUTED, fontSize: 13, textAlign: 'center', marginBottom: 18 },
  retryBtn: { backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 11 },
  retryBtnText: { color: DARK, fontWeight: '700', fontSize: 13 },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center' },
})