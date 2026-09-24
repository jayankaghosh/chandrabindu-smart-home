import React from "react";
import { ActivityIndicator, View, useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Home, Star, Sparkles, Mic, Menu } from "lucide-react-native";

import { AuthProvider, useAuth } from "./src/auth";
import { usePalette } from "./src/theme";
import type { MoreStackParams, RoomsStackParams } from "./src/navigation";

import LoginScreen from "./src/screens/LoginScreen";
import RoomsScreen from "./src/screens/RoomsScreen";
import RoomDetailScreen from "./src/screens/RoomDetailScreen";
import FavouritesScreen from "./src/screens/FavouritesScreen";
import RoutinesScreen from "./src/screens/RoutinesScreen";
import VoiceScreen from "./src/screens/VoiceScreen";
import MoreScreen from "./src/screens/MoreScreen";
import AutomationsScreen from "./src/screens/AutomationsScreen";
import InsightsScreen from "./src/screens/InsightsScreen";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const RoomsStack = createNativeStackNavigator<RoomsStackParams>();
const MoreStack = createNativeStackNavigator<MoreStackParams>();
const Tabs = createBottomTabNavigator();

function RoomsNavigator() {
  return (
    <RoomsStack.Navigator screenOptions={{ headerTransparent: false }}>
      <RoomsStack.Screen name="Rooms" component={RoomsScreen} options={{ headerShown: false }} />
      <RoomsStack.Screen
        name="RoomDetail"
        component={RoomDetailScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
    </RoomsStack.Navigator>
  );
}

function MoreNavigator() {
  return (
    <MoreStack.Navigator>
      <MoreStack.Screen name="More" component={MoreScreen} options={{ headerShown: false }} />
      <MoreStack.Screen name="Automations" component={AutomationsScreen} />
      <MoreStack.Screen name="Insights" component={InsightsScreen} />
    </MoreStack.Navigator>
  );
}

function MainTabs() {
  const p = usePalette();
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.brand,
        tabBarInactiveTintColor: p.textDim,
        tabBarStyle: { backgroundColor: p.card, borderTopColor: p.border },
      }}
    >
      <Tabs.Screen
        name="RoomsTab"
        component={RoomsNavigator}
        options={{ title: "Rooms", tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="Favourites"
        component={FavouritesScreen}
        options={{ tabBarIcon: ({ color, size }) => <Star color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="Routines"
        component={RoutinesScreen}
        options={{ tabBarIcon: ({ color, size }) => <Sparkles color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="Voice"
        component={VoiceScreen}
        options={{ tabBarIcon: ({ color, size }) => <Mic color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="MoreTab"
        component={MoreNavigator}
        options={{ title: "More", tabBarIcon: ({ color, size }) => <Menu color={color} size={size} /> }}
      />
    </Tabs.Navigator>
  );
}

function Root() {
  const { session, loading } = useAuth();
  const scheme = useColorScheme();
  const p = usePalette();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: p.bg }}>
        <ActivityIndicator color={p.brand} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={scheme === "dark" ? DarkTheme : DefaultTheme}>
      {session ? <MainTabs /> : <LoginScreen />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="auto" />
          <Root />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
