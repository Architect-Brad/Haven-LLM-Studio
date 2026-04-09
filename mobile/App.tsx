import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import HomeScreen from './src/screens/HomeScreen';
import ServerDetailScreen from './src/screens/ServerDetailScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ModelBrowserScreen from './src/screens/ModelBrowserScreen';
import LocalInferenceScreen from './src/screens/LocalInferenceScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator
            screenOptions={{
              headerStyle: {
                backgroundColor: '#161b22',
              },
              headerTintColor: '#f0f6fc',
              headerTitleStyle: {
                fontWeight: '600',
              },
              contentStyle: {
                backgroundColor: '#0d1117',
              },
            }}
          >
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: 'Haven LLM' }}
            />
            <Stack.Screen
              name="ServerDetail"
              component={ServerDetailScreen}
              options={{ title: 'Server' }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: 'Settings' }}
            />
            <Stack.Screen
              name="ModelBrowser"
              component={ModelBrowserScreen}
              options={{ title: 'Models' }}
            />
            <Stack.Screen
              name="LocalInference"
              component={LocalInferenceScreen}
              options={{ title: 'Local Chat' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
