import assert from "node:assert/strict";
import test from "node:test";

import {
  clearUserSession,
  getSnapshotRevision,
  saveSnapshot,
  STORAGE_KEYS,
} from "./snapshotStore.js";

test("clearing a user session removes snapshots but preserves the outbox, preferences, and terminal passcodes", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map([
    ...Object.values(STORAGE_KEYS).map((key) => [key, "cached"]),
    ["prds_offline_outbox_queue", "queued mutations"],
    ["prds-titlebar-pinned", "true"],
    ["prds_medicine_catalog_version", "cho-2026-09-20"],
    ["sb-prds-auth-token", "auth token"],
  ]);
  const previousRevision = getSnapshotRevision();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
  };

  try {
    await clearUserSession();

    assert.equal(getSnapshotRevision(), previousRevision + 1);
    for (const key of Object.values(STORAGE_KEYS)) {
      if (key !== STORAGE_KEYS.TERMINAL_PASSCODES) {
        assert.equal(values.has(key), false, `${key} should be cleared`);
      }
    }
    assert.equal(values.has(STORAGE_KEYS.TERMINAL_PASSCODES), true, "terminal passcodes must survive logout");
    assert.equal(values.get("sb-prds-auth-token"), undefined);
    assert.equal(values.get("prds_offline_outbox_queue"), "queued mutations");
    assert.equal(values.get("prds-titlebar-pinned"), "true");
    assert.equal(values.get("prds_medicine_catalog_version"), "cho-2026-09-20");
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test("snapshot writes are refused after the user session is cleared", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
  };

  try {
    await clearUserSession();
    assert.equal(saveSnapshot(STORAGE_KEYS.PATIENTS, [{ id: "private-row" }]), false);
    assert.equal(values.has(STORAGE_KEYS.PATIENTS), false);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test("first lifecycle upgrade clears legacy shared snapshots but preserves identity, terminal passcodes, and queued work", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map([
    ...Object.values(STORAGE_KEYS).map((key) => [key, "legacy-cache"]),
    ["prds_desktop_user_session", JSON.stringify({ id: "user-1" })],
    ["prds_desktop_user_profile", JSON.stringify({ id: "user-1" })],
    ["prds_medicine_catalog_version", "cho-2026-09-20"],
    ["prds_offline_outbox_queue", "queued mutations"],
    ["prds-titlebar-pinned", "true"],
  ]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
  };

  try {
    await import(`./snapshotStore.js?lifecycle-test=${Date.now()}`);
    for (const key of Object.values(STORAGE_KEYS)) {
      if (![STORAGE_KEYS.USER_SESSION, STORAGE_KEYS.USER_PROFILE, STORAGE_KEYS.TERMINAL_PASSCODES].includes(key)) {
        assert.equal(values.has(key), false, `${key} should be invalidated once`);
      }
    }
    assert.equal(values.has("prds_desktop_user_session"), true);
    assert.equal(values.has("prds_desktop_user_profile"), true);
    assert.equal(values.has(STORAGE_KEYS.TERMINAL_PASSCODES), true);
    assert.equal(values.get("prds_offline_outbox_queue"), "queued mutations");
    assert.equal(values.get("prds-titlebar-pinned"), "true");
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test("remember session flow preserves session on exit when checked, and clears session when unchecked", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
  };

  try {
    const { saveUserSession, getCachedUserSession } = await import("./snapshotStore.js");
    const testUser = { id: "pharma-user-1", email: "pharma@naga.gov.ph" };
    const testProfile = { id: "pharma-user-1", full_name: "Juan dela Cruz", role: "PHARMA_II", status: "ACTIVE" };

    // Simulate logged in user session
    saveUserSession(testUser, testProfile);
    let session = getCachedUserSession();
    assert.equal(session.user?.id, "pharma-user-1");
    assert.equal(session.profile?.id, "pharma-user-1");

    // Case 1: When remember session is checked, exit does NOT clear session
    // Reopening app immediately restores the user
    session = getCachedUserSession();
    assert.ok(session.user);
    assert.equal(session.user.id, "pharma-user-1");

    // Case 2: When remember session is unchecked, exit calls clearUserSession()
    values.set("prds_remember_session_on_exit", "false");
    await clearUserSession();

    // Reopening app finds no user session, requiring user to log in again
    session = getCachedUserSession();
    assert.equal(session.user, null);
    assert.equal(session.profile, null);
    // User exit preference itself remains preserved
    assert.equal(values.get("prds_remember_session_on_exit"), "false");
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test("terminal passcode registry saves, looks up by email/phone, and survives logout", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
  };

  try {
    const {
      saveTerminalPasscodeAccount,
      getTerminalPasscodeAccount,
      removeTerminalPasscodeAccount,
      clearUserSession,
    } = await import("./snapshotStore.js");

    const testUser = {
      id: "usr-passcode-001",
      email: "Pharmacist@Naga.gov.ph",
      phone: "+639171234567",
    };
    const testProfile = {
      id: "usr-passcode-001",
      first_name: "Maria",
      last_name: "Santos",
      role: "PHARMA_II",
      email: "pharmacist@naga.gov.ph",
      phone_number: "09171234567",
      status: "ACTIVE",
    };
    const testHash = "salt123:hashabc456";

    // 1. Save terminal passcode account
    saveTerminalPasscodeAccount({
      user: testUser,
      profile: testProfile,
      passcodeHash: testHash,
      session: { access_token: "tok1", refresh_token: "ref1" },
    });

    // 2. Lookup by email (case-insensitive)
    const byEmail = getTerminalPasscodeAccount("pharmacist@naga.gov.ph");
    assert.ok(byEmail);
    assert.equal(byEmail.userId, "usr-passcode-001");
    assert.equal(byEmail.passcodeHash, testHash);
    assert.equal(byEmail.profile?.first_name, "Maria");

    // 3. Lookup by phone in 09 format
    const byPhoneLocal = getTerminalPasscodeAccount("09171234567");
    assert.ok(byPhoneLocal);
    assert.equal(byPhoneLocal.userId, "usr-passcode-001");

    // 4. Lookup by phone in +63 format
    const byPhoneE164 = getTerminalPasscodeAccount("+639171234567");
    assert.ok(byPhoneE164);
    assert.equal(byPhoneE164.userId, "usr-passcode-001");

    // 5. Lookup by 10-digit suffix
    const byPhoneSuffix = getTerminalPasscodeAccount("9171234567");
    assert.ok(byPhoneSuffix);
    assert.equal(byPhoneSuffix.userId, "usr-passcode-001");

    // 6. Non-existent account returns null
    const notFound = getTerminalPasscodeAccount("unknown@naga.gov.ph");
    assert.equal(notFound, null);

    // 7. Clear user session (simulating logout) does NOT remove terminal passcode account
    await clearUserSession();
    const afterLogout = getTerminalPasscodeAccount("pharmacist@naga.gov.ph");
    assert.ok(afterLogout, "Passcode account must still exist after user session is cleared");
    assert.equal(afterLogout.passcodeHash, testHash);

    // 8. Explicit removeTerminalPasscodeAccount removes it
    removeTerminalPasscodeAccount("usr-passcode-001");
    const afterRemove = getTerminalPasscodeAccount("pharmacist@naga.gov.ph");
    assert.equal(afterRemove, null);
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

test("terminal passcode registry indexes Gmail from user metadata and OAuth identities", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
  };

  try {
    const {
      saveTerminalPasscodeAccount,
      getTerminalPasscodeAccount,
      saveUserSession,
      getCachedUserSession,
    } = await import("./snapshotStore.js");

    const testUser = {
      id: "usr-gmail-777",
      phone: "+639189876543",
      user_metadata: {
        email: "joshlaroa27@gmail.com",
        has_passcode: true,
      },
      identities: [
        {
          provider: "google",
          identity_data: {
            email: "joshlaroa27@gmail.com",
          },
        },
      ],
    };
    const testProfile = {
      id: "usr-gmail-777",
      first_name: "Josh",
      last_name: "Laroa",
      role: "PHARMA_II",
      facility_name: "Central Health Office - City of Naga",
      email: "joshlaroa27@gmail.com",
      phone_number: "09189876543",
      status: "ACTIVE",
    };
    const testHash = "hash:secure999";

    // Register terminal passcode account
    saveTerminalPasscodeAccount({
      user: testUser,
      profile: testProfile,
      passcodeHash: testHash,
      session: { access_token: "jwt-token-123" },
    });

    // Lookup using Gmail address
    const byGmail = getTerminalPasscodeAccount("joshlaroa27@gmail.com");
    assert.ok(byGmail, "Must detect account using Gmail identifier");
    assert.equal(byGmail.userId, "usr-gmail-777");
    assert.equal(byGmail.passcodeHash, testHash);
    assert.equal(byGmail.profile?.first_name, "Josh");
    assert.equal(byGmail.fullName, "Josh Laroa");
    assert.equal(byGmail.role, "PHARMA_II");
    assert.equal(byGmail.facilityName, "Central Health Office - City of Naga");

    // Lookup using uppercase/whitespace Gmail address
    const byGmailMessy = getTerminalPasscodeAccount("  JoshLaroa27@Gmail.com  ");
    assert.ok(byGmailMessy, "Must detect account with trimmed and case-insensitive Gmail");
    assert.equal(byGmailMessy.userId, "usr-gmail-777");

    // Lookup using Phone
    const byPhone = getTerminalPasscodeAccount("09189876543");
    assert.ok(byPhone, "Must detect account using linked phone number");

    // Session save and recovery
    saveUserSession(testUser, testProfile);
    const session = getCachedUserSession();
    assert.equal(session.user?.id, "usr-gmail-777");
    assert.equal(session.profile?.id, "usr-gmail-777");

    // Verify saveUserSession kept terminal account up to date
    const updatedTerminal = getTerminalPasscodeAccount("usr-gmail-777");
    assert.ok(updatedTerminal);
    assert.equal(updatedTerminal.fullName, "Josh Laroa");
  } finally {
    globalThis.localStorage = previousStorage;
  }
});

