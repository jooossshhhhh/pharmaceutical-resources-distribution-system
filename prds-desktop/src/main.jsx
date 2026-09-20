import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

import ErrorBoundary from "@frontend/components/ErrorBoundary";
import { AuthProvider } from "@frontend/context/AuthProvider";

import "./index.css";

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