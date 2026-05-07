const GUEST_PREFIX = "GUEST-";

export function isGuestIdentifier(phone: string | null | undefined): boolean {
  return typeof phone === "string" && phone.startsWith(GUEST_PREFIX);
}
