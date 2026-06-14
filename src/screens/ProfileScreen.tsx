import { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, SafeAreaView, Alert, Image,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'

export default function ProfileScreen() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Edit fields
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  const loadProfile = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('*, roles(name)')
        .eq('id', user.id)
        .single()

      setProfile({ ...data, role_name: data?.roles?.name ?? '', email: user.email })
      setFullName(data?.full_name ?? '')
      setPhone(data?.phone ?? '')
    } finally {
      setLoading(false)
    }
  }

  useFocusEffect(useCallback(() => { loadProfile() }, []))

  const saveProfile = async () => {
    if (!fullName.trim()) return Alert.alert('Required', 'Name cannot be empty')
    try {
      setSaving(true)
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), phone: phone.trim() || null })
        .eq('id', profile.id)
      if (error) throw error
      Alert.alert('Success', 'Profile updated successfully')
      await loadProfile()
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setSaving(false)
    }
  }

  const changePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      return Alert.alert('Required', 'Please fill in all password fields')
    }
    if (newPassword !== confirmPassword) {
      return Alert.alert('Error', 'New passwords do not match')
    }
    if (newPassword.length < 6) {
      return Alert.alert('Error', 'Password must be at least 6 characters')
    }
    try {
      setChangingPassword(true)
      // Re-authenticate
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      })
      if (signInError) throw new Error('Current password is incorrect')

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      Alert.alert('Success', 'Password changed successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordForm(false)
    } catch (e: any) {
      Alert.alert('Error', e.message)
    } finally {
      setChangingPassword(false)
    }
  }

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photo library')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (result.canceled) return

    try {
      setUploadingPhoto(true)
      const asset = result.assets[0]
      const ext = asset.uri.split('.').pop()
      const fileName = `${profile.id}.${ext}`

      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        name: fileName,
        type: `image/${ext}`,
      } as any)

      const { data, error } = await supabase.storage
        .from('profile-images')
        .upload(fileName, formData, { contentType: 'multipart/form-data', upsert: true })

      if (error) throw error

      const { data: urlData } = supabase.storage.from('profile-images').getPublicUrl(data.path)

      await supabase.from('profiles')
        .update({ profile_image_url: urlData.publicUrl })
        .eq('id', profile.id)

      await loadProfile()
      Alert.alert('Success', 'Profile photo updated')
    } catch (e: any) {
      Alert.alert('Upload Error', e.message)
    } finally {
      setUploadingPhoto(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#c9a84c" size="large" />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.headerTitle}>Profile & Settings</Text>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickPhoto} disabled={uploadingPhoto}>
            {profile?.profile_image_url ? (
              <Image source={{ uri: profile.profile_image_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>
                  {(profile?.full_name ?? 'U').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              {uploadingPhoto
                ? <ActivityIndicator color="#0d2818" size="small" />
                : <Text style={styles.avatarEditIcon}>📷</Text>}
            </View>
          </TouchableOpacity>
          <Text style={styles.profileName}>{profile?.full_name}</Text>
          <Text style={styles.profileRole}>{profile?.role_name}</Text>
          <Text style={styles.profileEmail}>{profile?.email}</Text>
        </View>

        {/* Edit Profile */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>

          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your full name"
            placeholderTextColor="#4a7a54"
          />

          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Your phone number"
            placeholderTextColor="#4a7a54"
            keyboardType="phone-pad"
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={saveProfile}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#0d2818" />
              : <Text style={styles.saveBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </View>

        {/* Change Password */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowPasswordForm(!showPasswordForm)}
          >
            <Text style={styles.sectionTitle}>Change Password</Text>
            <Text style={styles.chevron}>{showPasswordForm ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {showPasswordForm && (
            <>
              <Text style={styles.label}>Current Password</Text>
              <TextInput
                style={styles.input}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Enter current password"
                placeholderTextColor="#4a7a54"
                secureTextEntry
              />

              <Text style={styles.label}>New Password</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Enter new password"
                placeholderTextColor="#4a7a54"
                secureTextEntry
              />

              <Text style={styles.label}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor="#4a7a54"
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.saveBtn, changingPassword && { opacity: 0.6 }]}
                onPress={changePassword}
                disabled={changingPassword}
              >
                {changingPassword
                  ? <ActivityIndicator color="#0d2818" />
                  : <Text style={styles.saveBtnText}>Update Password</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={() => supabase.auth.signOut()}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0d2818' },
  center: { flex: 1, backgroundColor: '#0d2818', justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, paddingBottom: 40 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#ffffff', marginBottom: 24 },
  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatarCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#c9a84c', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: 90, height: 90, borderRadius: 45 },
  avatarText: { fontSize: 36, fontWeight: '800', color: '#0d2818' },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: '#c9a84c', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0d2818' },
  avatarEditIcon: { fontSize: 14 },
  profileName: { fontSize: 20, fontWeight: '800', color: '#ffffff', marginTop: 12 },
  profileRole: { fontSize: 13, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 },
  profileEmail: { fontSize: 13, color: '#6b8f71', marginTop: 4 },
  section: { backgroundColor: '#102e1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#1e4d2b', marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#ffffff', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#c9a84c', marginBottom: 6 },
  input: { backgroundColor: '#0d2818', borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, padding: 12, fontSize: 14, color: '#ffffff', marginBottom: 16 },
  saveBtn: { backgroundColor: '#c9a84c', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: '#0d2818', fontWeight: '700', fontSize: 15 },
  chevron: { color: '#6b8f71', fontSize: 14 },
  signOutBtn: { borderWidth: 1, borderColor: '#1e4d2b', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  signOutText: { color: '#e05c5c', fontWeight: '600', fontSize: 15 },
})