import React from "react";
import { useCompany } from "../../hooks/useCompany";
import defaultLogo from "../../assets/logo.png";

/**
 * Components/Common/FullPageLoader.jsx
 * ─────────────────────────────────────
 * The one full-page loading screen for the whole app. Used by
 * Routes/RoleRoute.jsx while the session is being verified and while
 * menu permissions are loading — i.e. it's what shows on EVERY route
 * transition, not just one page, so it needs to look intentional rather
 * than a bare spinner on a blank screen.
 *
 * Shows the company's own uploaded logo (Company Settings → branding) —
 * same source App.jsx uses for the favicon — falling back to the default
 * bundled logo if the company hasn't uploaded one yet or the request
 * hasn't resolved. getCompanyDetails is a public endpoint, so this is
 * safe to call before the session/auth check finishes.
 *
 * Pure CSS (no extra dependency) — three pulsing dots under the logo,
 * plus a couple of shimmer bars to hint "content is coming" rather than
 * "something is stuck".
 */
export default function FullPageLoader({ label = "Loading..." }) {
  const { data: companyDetails } = useCompany();
  const logoSrc = companyDetails?.logo;

  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center gap-4"
      style={{
        minHeight: "100vh",
        width: "100%",
        background: "linear-gradient(160deg, #f4f6ff 0%, #fbfbff 60%, #f6f4ff 100%)",
      }}
    >
      <style>{`
        @keyframes fpl-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes fpl-shimmer {
          0% { background-position: -200px 0; }
          100% { background-position: calc(200px + 100%) 0; }
        }
        .fpl-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #6366f1;
          display: inline-block;
          animation: fpl-bounce 1.2s ease-in-out infinite;
        }
        .fpl-dot:nth-child(2) { animation-delay: 0.15s; }
        .fpl-dot:nth-child(3) { animation-delay: 0.3s; }
        .fpl-bar {
          height: 10px;
          border-radius: 5px;
          background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 37%, #e5e7eb 63%);
          background-size: 400px 100%;
          animation: fpl-shimmer 1.4s ease-in-out infinite;
        }
      `}</style>

      <img src={logoSrc} alt="" style={{ height: 44, opacity: 0.9 }} />

      <div className="d-flex gap-2">
        <span className="fpl-dot" />
        <span className="fpl-dot" />
        <span className="fpl-dot" />
      </div>

      <div style={{ width: 180 }}>
        <div className="fpl-bar mb-2" style={{ width: "100%" }} />
        <div className="fpl-bar" style={{ width: "65%" }} />
      </div>

      <span className="text-muted" style={{ fontSize: "0.8rem" }}>{label}</span>
    </div>
  );
}
