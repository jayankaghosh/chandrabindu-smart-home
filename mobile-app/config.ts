// Where your Chandrabindu home server lives on the LAN, and the app name the
// wrapper expects /api/metadata to report. Change BASE_URL if your hub's
// address differs. EXPECTED_NAME must match `name` in the server's
// /api/metadata response (app/api/metadata/route.ts).

export const BASE_URL = "http://192.168.68.68";
export const METADATA_URL = `${BASE_URL}/api/metadata`;
export const EXPECTED_NAME = "Chandrabindu Smart Home";
