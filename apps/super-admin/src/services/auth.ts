import { authApi, setBearerToken } from "@barbaari/shared";

const TOKEN_KEY = "barbaari_super_token";
const EMAIL_KEY = "barbaari_super_email";

export function getStoredToken() { return localStorage.getItem(TOKEN_KEY); }
export function getStoredEmail() { return localStorage.getItem(EMAIL_KEY) ?? "super@barbaari.test"; }
export function storeSession(token: string, email: string) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(EMAIL_KEY, email); setBearerToken(token); }
export function clearSession() { localStorage.removeItem(TOKEN_KEY); setBearerToken(undefined); }
export async function login(email: string, password: string) { const response = await authApi.login(email, password); storeSession(response.token, email); return response.user; }
