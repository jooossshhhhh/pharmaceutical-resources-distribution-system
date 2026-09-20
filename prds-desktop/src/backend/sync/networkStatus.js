/**
 * Network Connectivity Monitor
 * Combines browser `navigator.onLine` events with periodic HTTP health checks against Supabase.
 */

import { useEffect, useState } from "react";

const PING_INTERVAL_MS = 20000; // 20 seconds
const listeners = new Set();
let isOnlineState = typeof navigator !== "undefined" ? navigator.onLine : true;
let pingTimerId = null;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

async function checkInternetConnection() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return false;
  }

  if (!SUPABASE_URL) {
    return navigator.onLine;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    // Lightweight HEAD or GET to Supabase REST health endpoint
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "",
      },
    });

    clearTimeout(timeoutId);
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

function notifyListeners(status) {
  if (isOnlineState !== status) {
    isOnlineState = status;
    listeners.forEach((listener) => listener(isOnlineState));
  }
}

async function verifyAndNotify() {
  const online = await checkInternetConnection();
  notifyListeners(online);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    verifyAndNotify();
  });

  window.addEventListener("offline", () => {
    notifyListeners(false);
  });

  // Start periodic background check
  pingTimerId = setInterval(() => {
    verifyAndNotify();
  }, PING_INTERVAL_MS);
}

export function subscribeNetworkStatus(callback) {
  listeners.add(callback);
  callback(isOnlineState);

  return () => {
    listeners.delete(callback);
  };
}

export function isCurrentNetworkOnline() {
  return isOnlineState;
}

export function useNetworkStatus() {
  const [online, setOnline] = useState(isOnlineState);

  useEffect(() => {
    return subscribeNetworkStatus(setOnline);
  }, []);

  return online;
}
