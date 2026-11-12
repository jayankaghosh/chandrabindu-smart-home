// Master all-on / all-off (shared by the Sleek and Nebula master buttons).
// Protected controls stay on and locked rooms are skipped server-side in
// /api/master. Resolves to a short human summary; throws with the API's error.
export async function runMaster(on: boolean): Promise<string> {
  const res = await fetch("/api/master", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ on }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || "Failed");
  return `${on ? "Turned on" : "Turned off"} ${d.ok} switch${d.ok === 1 ? "" : "es"}${d.skippedProtected ? ` · ${d.skippedProtected} protected kept` : ""}`;
}
