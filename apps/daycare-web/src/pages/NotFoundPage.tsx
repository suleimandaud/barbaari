import { Link } from "react-router-dom";
import { Compass } from "@phosphor-icons/react";

export function NotFoundPage() {
  return (
    <main className="bb-auth">
      <div className="bb-auth-card">
        <Compass size={48} color="var(--bb-accent)" aria-hidden />
        <h1>Page not found</h1>
        <p className="bb-lede">The page you're looking for doesn't exist or has been moved.</p>
        <Link className="bb-btn bb-btn-primary bb-btn-lg" to="/" style={{ alignSelf: "flex-start" }}>Go to Today</Link>
      </div>
    </main>
  );
}
