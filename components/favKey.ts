// Stable key for a favourited control (deviceId + control code), used in the
// client-side Set of favourites. "::" can't appear in a Tuya device id or a
// control code, so it's an unambiguous separator.
export function favKey(deviceId: string, code: string): string {
  return `${deviceId}::${code}`;
}
