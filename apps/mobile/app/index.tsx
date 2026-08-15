import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@barbaari/shared";
import { Button, Card, Screen } from "../components/Ui";

export default function Index() {
  return (
    <Screen>
      <View style={styles.container}>

        <View style={styles.logoContainer}>
          {/* <View style={styles.iconCircle}>
            <MaterialCommunityIcons
              name="tablet-dashboard"
              size={54}
              color="#fff"
            />
          </View> */}

          <Text style={styles.brand}>Barbaari</Text>

          <Text style={styles.title}>
            Attendance Tablet
          </Text>

          <Text style={styles.subtitle}>
            Fast, secure and simple child check-in & check-out for daycare
            organizations.
          </Text>
        </View>

        <Card style={styles.card}>
          <View style={styles.row}>
            <MaterialCommunityIcons
              name="check-circle-outline"
              size={22}
              color={colors.primary}
            />
            <Text style={styles.item}>
              Parent Check-in & Check-out
            </Text>
          </View>

          <View style={styles.row}>
            <MaterialCommunityIcons
              name="draw"
              size={22}
              color={colors.primary}
            />
            <Text style={styles.item}>
              Digital Signature Capture
            </Text>
          </View>

          <View style={styles.row}>
            <MaterialCommunityIcons
              name="clock-outline"
              size={22}
              color={colors.primary}
            />
            <Text style={styles.item}>
              Attendance & Time Tracking
            </Text>
          </View>

          <View style={styles.row}>
            <MaterialCommunityIcons
              name="shield-check-outline"
              size={22}
              color={colors.primary}
            />
            <Text style={styles.item}>
              Secure Verification
            </Text>
          </View>

          <Link href="/kiosk" asChild>
            <Button style={styles.button}>
              Get Started
            </Button>
          </Link>
        </Card>



      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 22,
    backgroundColor: colors.background,
  },

  logoContainer: {
    alignItems: "center",
    gap: 12,
  },

  iconCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
  },

  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.primary,
  },

  title: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center",
  },

  subtitle: {
    fontSize: 16,
    color: colors.muted,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 480,
  },

  card: {
    padding: 24,
    gap: 18,
    borderRadius: 22,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
  },

  item: {
    marginLeft: 14,
    fontSize: 17,
    color: colors.text,
    fontWeight: "600",
  },

  button: {
    marginTop: 18,
  },

  footer: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 14,
  },
});