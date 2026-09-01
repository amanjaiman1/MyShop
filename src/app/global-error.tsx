"use client";

/**
 * Last-resort boundary for a failure in the root layout itself. It has to bring
 * its own <html>/<body>, so it is deliberately dependency-free.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#fbf7f4",
          color: "#241f1e",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Something went wrong</h1>
          <p style={{ color: "#796c66", marginBottom: "1.5rem", lineHeight: 1.6 }}>
            Aurelia hit an unexpected error. Your data is safe. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#9e1f47",
              color: "#fff",
              border: 0,
              borderRadius: "10px",
              padding: "0.75rem 1.5rem",
              fontSize: "0.9rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
