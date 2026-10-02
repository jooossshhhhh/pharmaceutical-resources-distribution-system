export const PASSCODE_LENGTH = 6;

export const is6DigitNumeric = (value) => {
  return /^\d{6}$/.test((value || "").trim());
};

export const isRepetitivePasscode = (value) => {
  return /^(.)\1{5}$/.test((value || "").trim());
};

export const validatePasscodeInputs = (passcode, confirmPasscode) => {
  const clean = (passcode || "").trim();
  if (!clean || !is6DigitNumeric(clean)) {
    return "Passcode must be exactly 6 numeric digits.";
  }
  if (confirmPasscode !== undefined && clean !== (confirmPasscode || "").trim()) {
    return "The confirmed passcode does not match.";
  }
  if (isRepetitivePasscode(clean)) {
    return "Please choose a more secure passcode (avoid repeating numbers like 111111).";
  }
  return "";
};

export const detectIdentifierType = (identifier) => {
  const clean = (identifier || "").trim();
  if (!clean) return "empty";
  if (clean.includes("@")) return "email";
  return "phone";
};

export const getPasscodeStatusLabel = (hasPasscode) => {
  return hasPasscode ? "Active" : "Not configured";
};

export const hashPasscode = async (passcode, salt = "") => {
  const clean = (passcode || "").trim();
  const effectiveSalt =
    salt ||
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).substring(2, 12));

  const text = `${effectiveSalt}:${clean}`;

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${effectiveSalt}:${hashHex}`;
  }

  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return `${effectiveSalt}:${Math.abs(hash).toString(16)}`;
};

export const verifyPasscodeHash = async (passcode, storedHash) => {
  if (!passcode || !storedHash || typeof storedHash !== "string") {
    return false;
  }
  const parts = storedHash.split(":");
  if (parts.length < 2) {
    return false;
  }
  const salt = parts[0];
  const computed = await hashPasscode(passcode, salt);
  return computed === storedHash;
};

export const isDifferentFromCurrentPasscode = async (newPasscode, currentHash) => {
  if (!currentHash) {
    return true;
  }
  const isSame = await verifyPasscodeHash(newPasscode, currentHash);
  return !isSame;
};

export const validatePasscodeChange = async (newPasscode, confirmPasscode, currentHash) => {
  const baseError = validatePasscodeInputs(newPasscode, confirmPasscode);
  if (baseError) {
    return baseError;
  }
  if (currentHash) {
    const isDifferent = await isDifferentFromCurrentPasscode(newPasscode, currentHash);
    if (!isDifferent) {
      return "New passcode must be different from your current passcode.";
    }
  }
  return "";
};
