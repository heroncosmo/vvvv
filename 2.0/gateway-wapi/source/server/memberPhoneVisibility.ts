export function canViewPhoneNumbersFromPermissions(
  permissions?: Record<string, boolean> | null,
): boolean {
  return permissions?.canViewPhoneNumbers === true;
}
