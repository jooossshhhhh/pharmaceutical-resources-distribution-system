import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

import ErrorBoundary from "@frontend/components/ErrorBoundary";
import { AuthProvider } from "@frontend/context/AuthProvider";
import { applyUiScale, getSavedUiScale } from "@frontend/services/uiScaleService";

import "./index.css";

// Initialize UI scale preference upon boot
applyUiScale(getSavedUiScale());

ReactDOM.createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
