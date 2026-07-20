import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, SafeAreaView,
  TextInput, Image, Alert,
} from 'react-native'
import { supabase } from '../lib/supabase'

const GOLD  = '#c9a84c'
const DARK  = '#0a1209'
const MID   = '#152019'
const BORD  = '#1e3320'
const MUTED = '#8a9e8d'
const WHITE = '#e8e0d0'

export default function OrganizationProfileScreen({ navigation }: any) {
  const [orgId, setOrgId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [streetAddress, setStreetAddress] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [telephone, setTelephone] = useState('')
  const [email, setEmail] = useState('')
  const [wantsFeatured, setWantsFeatured] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase.from('profiles').select('organization_id').eq('id', user.id).single()
      if (!prof?.organization_id) return
      setOrgId(prof.organization_id)

      const { data: org } = await supabase
        .from('organizations')
        .select('name, logo_url, street_address, city, country, telephone, email, wants_to_be_featured')
        .eq('id', prof.organization_id)
        .single()

      if (org) {
        setName(org.name ?? '')
        setLogoUrl(org.logo_url ?? '')
        setStreetAddress(org.street_address ?? '')
        setCity(org.city ?? '')
        setCountry(org.country ?? '')
        setTelephone(org.telephone ?? '')
        setEmail(org.email ?? '')
        setWantsFeatured(org.wants_to_be_featured ?? false)
      }
    } finally {
      setLoading(false)
    }
  }

  const pickAndUploadLogo = async () => {
    const ImagePicker = await import('expo-image-picker')
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) { Alert.alert('Permission needed', 'Please allow access to your photo library'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
    if (result.canceled) return

    try {
      setUploading(true)
      const asset = result.assets[0]
      const ext = asset.uri.split('.').pop()
      const fileName = `org-logo-${orgId}-${Date.now()}.${ext}`
      const formData = new FormData()
      formData.append('file', { uri: asset.uri, name: fileName, type: `image/${ext}` } as any)
      const { data, error } = await supabase.storage.from('organization-assets').upload(fileName, formData, { contentType: 'multipart/form-data', upsert: true })
      if (error) { Alert.alert('Upload Error', error.message); return }
      const { data: urlData } = supabase.storage.from('organization-assets').getPublicUrl(data.path)
      setLogoUrl(urlData.publicUrl)
      Alert.alert('', 'Logo uploaded — remember to Save Changes.')
    } catch (e: any) {
      Alert.alert('Upload Error', e.message)
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Organization name is required.'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('organizations').update({
        name: name.trim(),
        logo_url: logoUrl || null,
        street_address: streetAddress || null,
        city: city || null,
        country: country || null,
        telephone: telephone || null,
        email: email || null,
        wants_to_be_featured: wantsFeatured,
      }).eq('id', orgId)
      if (error) { Alert.alert('Error', error.message); return }
      Alert.alert('Saved', 'Organization profile updated!')
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setSaving(false)
    }
  }

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
          <Text style={styles.headerEyebrow}>CEO · SETTINGS</Text>
          <Text style={styles.headerTitle}>Organization Profile</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.subtitle}>This name, logo, and address appear on Payment Vouchers, Petty Cash Vouchers, and other printed documents across the organization.</Text>

        <Text style={styles.label}>Organization Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Geobase Construction Ltd" placeholderTextColor="#4a7a54" />

        <Text style={styles.label}>Logo</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.logoPreview} resizeMode="contain" />
          ) : (
            <View style={styles.logoPlaceholder}><Text style={{ fontSize: 20 }}>🏢</Text></View>
          )}
          <TouchableOpacity style={styles.uploadBtn} onPress={pickAndUploadLogo} disabled={uploading}>
            {uploading ? <ActivityIndicator color={WHITE} size="small" /> : <Text style={styles.uploadBtnText}>📤 Upload Logo</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Street Address</Text>
        <TextInput style={styles.input} value={streetAddress} onChangeText={setStreetAddress} placeholder="e.g. 12 Independence Avenue" placeholderTextColor="#4a7a54" />

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>City</Text>
            <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="e.g. Kumasi" placeholderTextColor="#4a7a54" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Country</Text>
            <TextInput style={styles.input} value={country} onChangeText={setCountry} placeholder="e.g. Ghana" placeholderTextColor="#4a7a54" />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Telephone</Text>
            <TextInput style={styles.input} value={telephone} onChangeText={setTelephone} placeholder="+233 ..." placeholderTextColor="#4a7a54" keyboardType="phone-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="info@company.com" placeholderTextColor="#4a7a54" keyboardType="email-address" autoCapitalize="none" />
          </View>
        </View>

        <TouchableOpacity style={styles.featureBox} onPress={() => setWantsFeatured(!wantsFeatured)}>
          <View style={[styles.checkbox, wantsFeatured && styles.checkboxChecked]}>
            {wantsFeatured && <Text style={{ color: DARK, fontSize: 11, fontWeight: '800' }}>✓</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureText}>Allow Geobase to feature our logo on their public marketing website, as a customer of the platform.</Text>
            <Text style={styles.featureSubText}>Opting in doesn't guarantee inclusion — Geobase curates which logos are shown. You can withdraw consent here at any time.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={DARK} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>

        <Text style={styles.previewLabel}>Voucher Header Preview</Text>
        <View style={styles.previewCard}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.previewLogo} resizeMode="contain" />
          ) : (
            <View style={styles.previewLogoPlaceholder}><Text style={{ fontSize: 16 }}>🏢</Text></View>
          )}
          <Text style={styles.previewOrgName}>{name || 'Organization Name'}</Text>
          {(streetAddress || city || country) && (
            <Text style={styles.previewMeta}>{[streetAddress, city, country].filter(Boolean).join(', ')}</Text>
          )}
          {(telephone || email) && (
            <Text style={styles.previewMeta}>{[telephone, email].filter(Boolean).join(' · ')}</Text>
          )}
          <Text style={styles.previewVoucherLabel}>PAYMENT VOUCHER</Text>
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
  subtitle: { fontSize: 12, color: MUTED, lineHeight: 18, marginBottom: 20 },
  label: { fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6, fontWeight: '600' },
  input: { backgroundColor: DARK, borderWidth: 1, borderColor: BORD, borderRadius: 10, padding: 12, fontSize: 14, color: WHITE, marginBottom: 16 },
  logoPreview: { width: 52, height: 52, borderRadius: 10, backgroundColor: DARK, borderWidth: 1, borderColor: BORD },
  logoPlaceholder: { width: 52, height: 52, borderRadius: 10, backgroundColor: DARK, borderWidth: 1, borderColor: BORD, alignItems: 'center', justifyContent: 'center' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16 },
  uploadBtnText: { color: WHITE, fontSize: 12, fontWeight: '600' },
  featureBox: { flexDirection: 'row', gap: 10, backgroundColor: DARK, borderWidth: 1, borderColor: BORD, borderRadius: 12, padding: 14, marginTop: 4, marginBottom: 20 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: BORD, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: GOLD, borderColor: GOLD },
  featureText: { color: WHITE, fontSize: 12, lineHeight: 17 },
  featureSubText: { color: MUTED, fontSize: 10, lineHeight: 14, marginTop: 4 },
  saveBtn: { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 28 },
  saveBtnText: { color: DARK, fontWeight: '800', fontSize: 14 },
  previewLabel: { fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10, textAlign: 'center' },
  previewCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 2, borderColor: '#000', padding: 20, alignItems: 'center' },
  previewLogo: { width: 40, height: 40, marginBottom: 6 },
  previewLogoPlaceholder: { width: 40, height: 40, borderRadius: 6, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  previewOrgName: { fontSize: 15, fontWeight: '700', color: '#000' },
  previewMeta: { fontSize: 10, color: '#000', marginTop: 3 },
  previewVoucherLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#000', marginTop: 10, borderTopWidth: 2, borderTopColor: '#000', paddingTop: 10, width: '100%', textAlign: 'center' },
})