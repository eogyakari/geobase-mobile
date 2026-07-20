import 'react-native-url-polyfill/auto'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useEffect, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { supabase } from './src/lib/supabase'
import LoginScreen from './src/screens/LoginScreen'
import HomeScreen from './src/screens/HomeScreen'
import ProjectAnalyticsScreen from './src/screens/ProjectAnalyticsScreen'
import PettyCashScreen from './src/screens/PettyCashScreen'
import ProcessPaymentScreen from './src/screens/ProcessPaymentScreen'
import AdminPettyCashScreen from './src/screens/AdminPettyCashScreen'
import AwardVendorScreen from './src/screens/AwardVendorScreen'
import ApprovePaymentRequestScreen from './src/screens/ApprovePaymentRequestScreen'
import UserManagementScreen from './src/screens/UserManagementScreen'
import PMScheduleScreen from './src/screens/PMScheduleScreen'
import { savePushToken } from './src/lib/notifications'
import FinanceReportsScreen from './src/screens/FinanceReportsScreen'
import AuditorScreen from './src/screens/AuditorScreen'
import ViewerScreen from './src/screens/ViewerScreen'
import OrganizationProfileScreen from './src/screens/OrganizationProfileScreen'
import PayslipBrandingScreen from './src/screens/PayslipBrandingScreen'
import LandingPageScreen from './src/screens/LandingPageScreen'

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
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="ProjectAnalytics" component={ProjectAnalyticsScreen} />
            <Stack.Screen name="PettyCash" component={PettyCashScreen} />
            <Stack.Screen name="ProcessPayment" component={ProcessPaymentScreen} />
            <Stack.Screen name="AdminPettyCash" component={AdminPettyCashScreen} />
            <Stack.Screen name="AwardVendor" component={AwardVendorScreen} />
            <Stack.Screen name="ApprovePaymentRequest" component={ApprovePaymentRequestScreen} />
            <Stack.Screen name="UserManagement" component={UserManagementScreen} />
            <Stack.Screen name="PMSchedule" component={PMScheduleScreen} />
            <Stack.Screen name="FinanceReports" component={FinanceReportsScreen} />
            <Stack.Screen name="Auditor" component={AuditorScreen} />
            <Stack.Screen name="ViewerPortal" component={ViewerScreen} />
            <Stack.Screen name="OrganizationProfile" component={OrganizationProfileScreen} />
            <Stack.Screen name="PayslipBranding" component={PayslipBrandingScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="LandingPage" component={LandingPageScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}