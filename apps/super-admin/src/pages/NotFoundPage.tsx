import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="page" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="panel" style={{ maxWidth: 460, textAlign: "center", padding: "40px 32px" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
        <h1 style={{ margin: "0 0 8px" }}>Page not found</h1>
        <p style={{ color: "#647a82", marginBottom: 24 }}>The page you're looking for doesn't exist.</p>
        <Link className="primary" to="/" style={{ display: "inline-flex", textDecoration: "none" }}>Go to Dashboard</Link>
      </div>
    </main>
  );
}
