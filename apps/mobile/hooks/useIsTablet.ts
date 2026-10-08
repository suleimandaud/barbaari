import { useState } from "react";
import { Dimensions, Platform } from "react-native";

/**
 * True on tablets: iPads, and any device whose *screen* (not window) shortest side is at
 * least 600pt — the usual tablet threshold (Android sw600dp). Measured once from the
 * screen, so it stays stable when an iPad enters split view or rotates; a running kiosk
 * flow never swaps layouts mid-check-in. Phones always get the existing phone UI.
 */
export function isTabletDevice() {
  if (Platform.OS === "ios" && Platform.isPad) return true;
  const { width, height } = Dimensions.get("screen");
  return Math.min(width, height) >= 600;
}

export function useIsTablet() {
  const [isTablet] = useState(isTabletDevice);
  return isTablet;
}
