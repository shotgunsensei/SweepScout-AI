import { Tabs } from "expo-router";
import { ClipboardList, Database, Gauge, Settings, ShieldCheck } from "lucide-react-native";
import { colors } from "@/constants/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          minHeight: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color, size }) => <Gauge color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="sweepstakes"
        options={{
          title: "Database",
          tabBarIcon: ({ color, size }) => <Database color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="entries"
        options={{
          title: "Entries",
          tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="operations"
        options={{
          title: "Ops",
          tabBarIcon: ({ color, size }) => <ShieldCheck color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
