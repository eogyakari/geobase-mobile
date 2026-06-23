import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Alert, Image,
} from 'react-native'
import { supabase } from '../lib/supabase'

const GOLD = '#c9a84c'
const DARK = '#0a1209'
const MID  = '#152019'

export default function LoginScreen() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [showPass, setShowPass] = useState(false)

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password.')
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (error) {
        Alert.alert('Login Failed', error.message)
        return
      }

      // Store role in memory for nav
      const { data: profile } = await supabase
        .from('profiles')
        .select('role:roles!role_id(name)')
        .eq('id', data.user.id)
        .single()

      const role = (profile?.role as any)?.name ?? 'Employee'
      console.log('Logged in as:', role)

    } catch (err: any) {
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: DARK }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo mark */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/adaptive-icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.brandName}>GEOBASE</Text>
          <Text style={styles.brandSub}>ERP</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@company.com"
              placeholderTextColor="#5a7a5d"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#5a7a5d"
                secureTextEntry={!showPass}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowPass(v => !v)}
                style={styles.showBtn}
              >
                <Text style={{ color: GOLD, fontSize: 12 }}>
                  {showPass ? 'HIDE' : 'SHOW'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Login button */}
          <TouchableOpacity
            style={[styles.loginBtn, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={DARK} />
              : <Text style={styles.loginBtnText}>Sign In</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Geobase Enterprise Resource Platform
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0a1209',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoImage: {
    width: 88,
    height: 88,
    marginBottom: 14,
  },
  brandName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#e8e0d0',
    letterSpacing: 4,
  },
  brandSub: {
    fontSize: 10,
    color: GOLD,
    letterSpacing: 6,
    marginTop: 4,
  },
  card: {
    width: '100%',
    backgroundColor: MID,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: '#1e3320',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#e8e0d0',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#8a9e8d',
    marginBottom: 28,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 10,
    color: '#8a9e8d',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0a1209',
    borderWidth: 1,
    borderColor: '#2a4030',
    borderRadius: 10,
    padding: 13,
    color: '#e8e0d0',
    fontSize: 14,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  showBtn: {
    padding: 13,
    backgroundColor: '#0a1209',
    borderWidth: 1,
    borderColor: '#2a4030',
    borderRadius: 10,
  },
  loginBtn: {
    backgroundColor: GOLD,
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  loginBtnText: {
    color: DARK,
    fontWeight: '800',
    fontSize: 15,
  },
  footer: {
    marginTop: 32,
    fontSize: 11,
    color: '#3a5a3d',
    letterSpacing: 1,
  },
})