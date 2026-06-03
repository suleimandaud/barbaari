export function ErrorAlert({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="alert-banner danger">{message}</div>;
}

export function SuccessAlert({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="alert-banner success">{message}</div>;
}
