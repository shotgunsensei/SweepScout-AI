import "react-native-gesture-handler";
import { useMemo } from "react";
import { StatusBar } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { colors } from "@/constants/colors";

export default function RootLayout() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
    [],
  );

  const [fontsLoaded] = useFonts({});
  if (!fontsLoaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "800" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="discovery" options={{ title: "Discovery Jobs" }} />
        <Stack.Screen name="queue" options={{ title: "Assistant Queue" }} />
        <Stack.Screen name="entries-queue" options={{ title: "Prefill Queue" }} />
        <Stack.Screen name="entry-review/[id]" options={{ title: "Entry Review" }} />
        <Stack.Screen name="scoring" options={{ title: "Scoring" }} />
        <Stack.Screen name="extraction" options={{ title: "Extraction" }} />
        <Stack.Screen name="vault" options={{ title: "Secure Vault" }} />
        <Stack.Screen name="admin" options={{ title: "Admin Debug" }} />
      </Stack>
    </QueryClientProvider>
  );
}
