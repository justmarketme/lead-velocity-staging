import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App.tsx";
import "./index.css";

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("App failed to render:", error, info);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
          maxWidth: "600px",
          margin: "2rem auto",
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: "8px",
        }}>
          <h1 style={{ color: "#b91c1c", marginBottom: "0.5rem" }}>Something went wrong</h1>
          <p style={{ color: "#991b1b", marginBottom: "1rem" }}>{this.state.error.message}</p>
          <pre style={{ overflow: "auto", fontSize: "12px", background: "#fff", padding: "1rem", borderRadius: "4px" }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root")!;
createRoot(root).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
