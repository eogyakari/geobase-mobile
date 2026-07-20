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

export default function PayslipBrandingScreen({ navigation }: any) {
  const [orgId, setOrgId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const [logoUrl, setLogoUrl] = useState('')
  const [watermarkEnabled, setWatermarkEnabled] = useState(false)
  const [watermarkText, setWatermarkText] = useState('')
  const [signatureName, setSignatureName] = useState('')
  const [signatureTitle, setSignatureTitle] = useState('')

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
        .select('logo_url, payslip_watermark_enabled, payslip_watermark_text, payslip_signature_name, payslip_signature_title')
        .eq('id', prof.organization_id)
        .single()

      if (org) {
        setLogoUrl(org.logo_url ?? '')
        setWatermarkEnabled(org.payslip_watermark_enabled ?? false)
        setWatermarkText(org.payslip_watermark_text ?? '')
        setSignatureName(org.payslip_signature_name ?? '')
        setSignatureTitle(org.payslip_signature_title ?? '')
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
      setUploadingLogo(true)
      const asset = result.assets[0]
      const ext = asset.uri.split('.').pop()
      const fileName = `${orgId}-logo-${Date.now()}.${ext}`
      const formData = new FormData()
      formData.append('file', { uri: asset.uri, name: fileName, type: `image/${ext}` } as any)
      const { data, error } = await supabase.storage.from('organization-assets').upload(fileName, formData, { contentType: 'multipart/form-data', upsert: true })
      if (error) { Alert.alert('Upload Error', error.message); return }
      const { data: urlData } = supabase.storage.from('organization-assets').getPublicUrl(data.path)
      setLogoUrl(urlData.publicUrl)
      Alert.alert('', 'Logo uploaded — remember to Save.')
    } catch (e: any) {
      Alert.alert('Upload Error', e.message)
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase.from('organizations').update({
        logo_url: logoUrl || null,
        payslip_watermark_enabled: watermarkEnabled,
        payslip_watermark_text: watermarkEnabled ? watermarkText : null,
        payslip_signature_name: signatureName || null,
        payslip_signature_title: signatureTitle || null,
      }).eq('id', orgId)
      if (error) { Alert.alert('Error', error.message); return }
      Alert.alert('Saved', 'Payslip branding updated!')
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
          <Text style={styles.headerEyebrow}>ORGANIZATION SETTINGS</Text>
          <Text style={styles.headerTitle}>Payslip Branding</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.subtitle}>Customize how your organization's payslips look — logo, watermark, and authorized signature.</Text>

        {/* Logo */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>🖼️ Company Logo</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 }}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logoPreview} resizeMode="contain" />
            ) : (
              <View style={styles.logoPlaceholder}><Text style={{ fontSize: 22 }}>🏢</Text></View>
            )}
            <TouchableOpacity style={styles.uploadBtn} onPress={pickAndUploadLogo} disabled={uploadingLogo}>
              {uploadingLogo ? <ActivityIndicator color={GOLD} size="small" /> : <Text style={styles.uploadBtnText}>📤 {logoUrl ? 'Change Logo' : 'Upload Logo'}</Text>}
            </TouchableOpacity>
          </View>
          <Text style={styles.helperText}>Appears at the top of every payslip PDF.</Text>
        </View>

        {/* Watermark */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>💧 Watermark</Text>
          <TouchableOpacity style={styles.checkRow} onPress={() => setWatermarkEnabled(!watermarkEnabled)}>
            <View style={[styles.checkbox, watermarkEnabled && styles.checkboxChecked]}>
              {watermarkEnabled && <Text style={{ color: DARK, fontSize: 11, fontWeight: '800' }}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>Show a diagonal watermark across each payslip</Text>
          </TouchableOpacity>
          {watermarkEnabled && (
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              value={watermarkText}
              onChangeText={setWatermarkText}
              placeholder="e.g. CONFIDENTIAL, or your company name"
              placeholderTextColor="#4a7a54"
            />
          )}
        </View>

        {/* Signature */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>✍️ Authorized Signature</Text>
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={signatureName} onChangeText={setSignatureName} placeholder="e.g. Eugene Owusu Gyakari" placeholderTextColor="#4a7a54" />
            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} value={signatureTitle} onChangeText={setSignatureTitle} placeholder="e.g. Finance Director" placeholderTextColor="#4a7a54" />
          </View>
          <Text style={styles.helperText}>Printed as a text signature line at the bottom of every payslip.</Text>
        </View>

        <TouchableOpacity style={[styles.saveBtn, (saving || uploadingLogo) && { opacity: 0.6 }]} onPress={handleSave} disabled={saving || uploadingLogo}>
          {saving ? <ActivityIndicator color={DARK} /> : <Text style={styles.saveBtnText}>Save Branding Settings</Text>}
        </TouchableOpacity>
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
  subtitle: { fontSize: 12, color: MUTED, lineHeight: 18, marginBottom: 16 },
  card: { backgroundColor: MID, borderWidth: 1, borderColor: BORD, borderRadius: 14, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: WHITE },
  logoPreview: { width: 56, height: 56, borderRadius: 10, backgroundColor: DARK, borderWidth: 1, borderColor: BORD },
  logoPlaceholder: { width: 56, height: 56, borderRadius: 10, backgroundColor: DARK, borderWidth: 1, borderColor: BORD, alignItems: 'center', justifyContent: 'center' },
  uploadBtn: { flex: 1, backgroundColor: GOLD + '18', borderWidth: 1, borderColor: GOLD + '44', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  uploadBtnText: { color: GOLD, fontSize: 12, fontWeight: '700' },
  helperText: { color: MUTED, fontSize: 11, marginTop: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: BORD, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: GOLD, borderColor: GOLD },
  checkLabel: { color: WHITE, fontSize: 12, flex: 1 },
  label: { fontSize: 11, color: MUTED, marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: DARK, borderWidth: 1, borderColor: BORD, borderRadius: 10, padding: 12, fontSize: 14, color: WHITE },
  saveBtn: { backgroundColor: GOLD, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: DARK, fontWeight: '800', fontSize: 14 },
})