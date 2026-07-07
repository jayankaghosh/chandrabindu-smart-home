// Minimal localhost HTTP API the Next app calls instead of opening its own LAN
// connections. Also exposes an SSE stream of change events (for live UI / the
// rule engine). Auth: optional shared secret (GATEWAY_SECRET) — if set, every
// request must present it via `x-gateway-secret`.

const http = require("http");

function createServer(gateway, { secret, onReinit } = {}) {
  const sseClients = new Set();

  // Fan out every change event to connected SSE clients.
  gateway.on("change", (evt) => {
    const line = `event: change\ndata: ${JSON.stringify(evt)}\n\n`;
    for (const res of sseClients) res.write(line);
  });

  function authorized(req) {
    if (!secret) return true;
    return (req.headers["x-gateway-secret"] || "") === secret;
  }

  function json(res, code, body) {
    const s = JSON.stringify(body);
    res.writeHead(code, { "content-type": "application/json" });
    res.end(s);
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);

    if (url.pathname === "/health") {
      return json(res, 200, { ok: true, ...gateway.health() });
    }

    if (!authorized(req)) return json(res, 403, { error: "Forbidden" });

    // Rebuild all device connections from a fresh catalog (admin re-init).
    if (req.method === "POST" && url.pathname === "/reinit") {
      const health = onReinit ? onReinit() : gateway.reinit();
      return json(res, 200, { ok: true, ...health });
    }

    // SSE stream of change events.
    if (url.pathname === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(`event: ready\ndata: {}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    // GET /status/:id[?fresh=1]
    if (req.method === "GET" && parts[0] === "status" && parts[1]) {
      try {
        const out = await gateway.status(parts[1], { fresh: url.searchParams.get("fresh") === "1" });
        return json(res, 200, out);
      } catch (e) {
        return json(res, e.message === "unknown device" ? 404 : 503, { error: e.message });
      }
    }

    // POST /command/:id   body: { commands: [{code, value}] }
    if (req.method === "POST" && parts[0] === "command" && parts[1]) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        let commands = [];
        try { commands = JSON.parse(body).commands || []; } catch {}
        if (!Array.isArray(commands) || commands.length === 0) {
          return json(res, 400, { error: "commands[] required" });
        }
        try {
          await gateway.command(parts[1], commands);
          return json(res, 200, { ok: true });
        } catch (e) {
          return json(res, e.message === "unknown device" ? 404 : 503, { error: e.message });
        }
      });
      return;
    }

    json(res, 404, { error: "not found" });
  });

  return server;
}

module.exports = { createServer };
