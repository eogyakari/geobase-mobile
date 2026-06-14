import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import 'react-native-url-polyfill/auto'

const supabaseUrl = 'https://xpwzkzbvxqjzmnyqshtm.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhwd3premJ2eHFqem1ueXFzaHRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTc0NjgsImV4cCI6MjA5NDA3MzQ2OH0.2_XoGpdn-MRcUsiOEDMKfHWBkRAaME01XptHzGoG7Fk'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})