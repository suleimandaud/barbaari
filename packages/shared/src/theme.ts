export const colors = {
  primary: "#2A7B88",
  primaryDark: "#1F6470",
  secondary: "#FF9E80",
  tertiary: "#FFD54F",
  neutral: "#455A64",
  background: "#EEF8FB",
  backgroundAlt: "#F8FCFD",
  card: "#E4F4F8",
  cardStrong: "#D6EDF3",
  white: "#FFFFFF",
  border: "#C9E2E8",
  success: "#2E9D72",
  warning: "#D99B1D",
  danger: "#D95D5D",
  text: "#20343B",
  muted: "#647A82"
} as const;

export const fonts = {
  headline: "Quicksand",
  body: "Plus Jakarta Sans",
  label: "Plus Jakarta Sans"
} as const;

export const shadows = {
  soft: "0 16px 40px rgba(42, 123, 136, 0.12)",
  subtle: "0 8px 24px rgba(32, 52, 59, 0.08)"
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999
} as const;

export const statusColor = {
  checkedIn: colors.primary,
  checkedOut: colors.neutral,
  absent: colors.warning,
  incident: colors.secondary,
  paid: colors.success,
  overdue: colors.danger,
  pending: colors.tertiary
} as const;
