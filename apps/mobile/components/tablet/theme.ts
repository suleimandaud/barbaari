import { Platform } from "react-native";

/*
 * Tablet kiosk design tokens — design/tablet-redesign ("Barbaari Tablet Kiosk", iPad
 * landscape 1024×768). Local to the tablet layout so the shared mobile `colors` used by
 * the phone screens are untouched.
 */
export const t = {
  brand: "#2F8F98",
  accent: "#237680",
  accent600: "#1E6A73",
  accent100: "#E7F4F5",
  accent400: "#5FB0B8",
  accent800: "#174F55",
  text: "#173236",
  bg: "#F8F6F1",
  surface: "#EFECE4",
  divider: "#D9E0DF",
  neutral200: "#E7E4DD",
  neutral400: "#B7B6AF",
  neutral600: "#6F7A7B",
  neutral700: "#53656A",
  neutral800: "#3A4B4E",
  white: "#FFFFFF",
  ok: { bg: "#E1EFE6", fg: "#22573A" },
  muted: { bg: "#E7E4DD", fg: "#3A4B4E" },
  absent: { bg: "#E4EAF1", fg: "#30445A" },
  warn: { bg: "#FAEFD6", fg: "#6E4C0E" },
  danger: { bg: "#F7E1DC", fg: "#8A2E22" },
  info: { bg: "#E7F4F5", fg: "#174F55" },
  radius: 4,
  radiusSm: 2,
  touch: 64
};

/** Five-colour avatar palette, same as the web design system. */
export const avatarTints = [
  { bg: "#D7ECEE", fg: "#174F55" },
  { bg: "#F3E6CF", fg: "#6E4E17" },
  { bg: "#E6E1EF", fg: "#4A3F66" },
  { bg: "#E1EEE4", fg: "#2D5A3A" },
  { bg: "#F4E0DA", fg: "#7A3A2C" }
];

// Source Serif 4 is bundled in assets/fonts and loaded by useTabletFonts(). Custom fonts
// carry their own weight, so styles pick the family instead of setting fontWeight
// (Android ignores fontWeight on custom families). Until the fonts load — or if they
// fail — the platform serif is used so text never disappears.
export const fontFiles = {
  "SourceSerif4-Regular": require("../../assets/fonts/SourceSerif4-Regular.ttf"),
  "SourceSerif4-SemiBold": require("../../assets/fonts/SourceSerif4-SemiBold.ttf")
};

const fallbackSerif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });

export function fonts(loaded: boolean) {
  return {
    regular: loaded ? "SourceSerif4-Regular" : fallbackSerif,
    semibold: loaded ? "SourceSerif4-SemiBold" : fallbackSerif
  };
}
