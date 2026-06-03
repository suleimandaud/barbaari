export function money(value: unknown) {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

export function dateShort(value?: string | null) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function titleize(value?: string | null) {
  return String(value ?? "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function errorMessage(error: unknown) {
  const maybe = error as { response?: { data?: { message?: string } }; message?: string };
  return maybe.response?.data?.message ?? maybe.message ?? "Request failed.";
}
