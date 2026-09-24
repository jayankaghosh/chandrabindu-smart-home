import { api as url } from "./config";
import { getToken } from "./tokenStore";

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, message: string, body?: any) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// One place for every hub request: attaches the bearer token, sends/parses JSON,
// and turns non-2xx responses into a typed ApiError the UI can branch on.
async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url(path), {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (e) {
    throw new ApiError(0, "Can't reach your home hub. Check Wi-Fi and the server address.");
  }

  const text = await res.text();
  const data = text ? safeParse(text) : null;
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const apiGet = <T>(path: string) => request<T>(path);
export const apiPost = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body });
export const apiPut = <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body });
