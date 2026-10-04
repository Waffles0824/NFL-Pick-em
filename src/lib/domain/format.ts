export function teamNickname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.at(-1) ?? fullName;
}

export function teamCity(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  return parts.slice(0, -1).join(" ");
}

export function matchupLabel(away: string, home: string): string {
  return `${teamNickname(away)} @ ${teamNickname(home)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0] ?? "").join("");
  return letters.toUpperCase() || "?";
}

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createInviteCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join(
    "",
  );
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegistration(input: {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}): string | null {
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 40) {
    return "Display name should be 2–40 characters.";
  }
  if (!EMAIL_PATTERN.test(normalizeEmail(input.email))) {
    return "Enter a valid email address.";
  }
  if (input.password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (input.password.length > 72) {
    return "Password must be 72 characters or fewer.";
  }
  if (input.password !== input.confirmPassword) {
    return "Password and confirm password must match.";
  }
  return null;
}

export function validateDisplayName(displayName: string): string | null {
  const trimmed = displayName.trim();
  if (trimmed.length < 2 || trimmed.length > 40) {
    return "Display name should be 2–40 characters.";
  }
  return null;
}

export function validateLeagueName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 48) {
    return "League name should be 3–48 characters.";
  }
  return null;
}

export function validatePrediction(value: number): string | null {
  if (!Number.isInteger(value) || value < 0 || value > 150) {
    return "Enter a whole number of combined points from 0 to 150.";
  }
  return null;
}
