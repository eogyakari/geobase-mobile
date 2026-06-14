import 'react-native-url-polyfill/auto'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { supabase } from './src/lib/supabase'
import LoginScreen from './src/screens/LoginScreen'
import HomeScreen from './src/screens/HomeScreen'
import { savePushToken } from './src/lib/notifications'

const Stack = createNativeStackNavigator()

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setSession(session)
    if (session?.user) {
      savePushToken(session.user.id)
    }
    setLoading(false)
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session)
    if (session?.user) {
      savePushToken(session.user.id)
    }
  })
}, [])

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0d2818', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#c9a84c" size="large" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <Stack.Screen name="Home" component={HomeScreen} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}