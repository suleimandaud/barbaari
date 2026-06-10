import * as SecureStore from "expo-secure-store";
import { authApi, setBearerToken } from "@barbaari/shared";

const TOKEN_KEY = "barbaari_token";
const USER_KEY = "barbaari_user";

export type MobileRole = "parent" | "staff" | "teacher";
export type MobileUser = { id: number | string; name: string; email: string; role: string; organization?: any; staffProfile?: any };

export function mobileAreaForRole(role?: string | null): "parent" | "staff" | "unsupported" {
  if (role === "parent") return "parent";
  if (role === "staff" || role === "teacher") return "staff";
  return "unsupported";
}

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getStoredUser(): Promise<MobileUser | null> {
  const value = await SecureStore.getItemAsync(USER_KEY);
  return value ? JSON.parse(value) : null;
}

async function storeUser(user: MobileUser) {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function restoreToken() {
  const token = await getToken();
  setBearerToken(token);
  return token;
}

export async function loginMobile(email: string, password: string) {
  const response = await authApi.login(email, password);
  await SecureStore.setItemAsync(TOKEN_KEY, response.token);
  setBearerToken(response.token);
  const me = (await authApi.me()).user;
  await storeUser(me);
  return me as MobileUser;
}

export async function loginTabletWithPin(email: string, pin: string) {
  const response = await authApi.pinLogin({ email, pin, purpose: "tablet_attendance" });
  await SecureStore.setItemAsync(TOKEN_KEY, response.token);
  setBearerToken(response.token);
  const me = (await authApi.me()).user;
  await storeUser(me);
  return me as MobileUser;
}

export async function unlockTablet(mode: "staff" | "admin", email: string, credential: string) {
  const response = await authApi.tabletUnlock({
    mode,
    email,
    pin: mode === "staff" || (mode === "admin" && /^\d{4,8}$/.test(credential)) ? credential : undefined,
    password_or_pin: mode === "admin" ? credential : undefined,
    purpose: `tablet_${mode}`
  });
  await SecureStore.setItemAsync(TOKEN_KEY, response.token);
  setBearerToken(response.token);
  await storeUser(response.user);
  return response;
}

export async function registerParentMobile(name: string, email: string, password: string) {
  const response = await authApi.register({ name, email, password, role: "parent" });
  await SecureStore.setItemAsync(TOKEN_KEY, response.token);
  setBearerToken(response.token);
  const me = (await authApi.me()).user;
  await storeUser(me);
  return me as MobileUser;
}

export async function restoreSession() {
  const token = await restoreToken();
  if (!token) return null;
  try {
    const me = (await authApi.me()).user;
    await storeUser(me);
    return me as MobileUser;
  } catch {
    await logoutMobile();
    return null;
  }
}

export async function logoutMobile() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  setBearerToken(undefined);
}
