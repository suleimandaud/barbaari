import { Alert } from "@barbaari/shared/web/ui";

export function ErrorAlert({ message }: { message?: string }) {
  if (!message) return null;
  return <Alert tone="danger">{message}</Alert>;
}

export function SuccessAlert({ message }: { message?: string }) {
  if (!message) return null;
  return <Alert tone="ok">{message}</Alert>;
}
