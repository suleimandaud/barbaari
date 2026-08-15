import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@barbaari/shared";
import { Button } from "./Ui";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * A single uncaught render error anywhere in the app previously crashed the whole screen
 * with no recovery path. This catches it, logs it, and offers a way back to a working
 * state instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error caught by ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>This screen ran into an unexpected problem. Your data is safe — try again.</Text>
          <Button onPress={() => this.setState({ error: null })}>Try again</Button>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  message: { fontSize: 14, color: colors.text, textAlign: "center", marginBottom: 8 }
});
