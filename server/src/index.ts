import http from "http";
import url from "url";
import { WebSocketServer, WebSocket } from "ws";
import { initDatabase, getRecentTelemetry, closeDatabase } from "./database";
import { initMqttBroker, sendCommand } from "./mqttHandler";
import { DeviceCommand, WsMessage, TelemetryData } from "../../shared/types";

const HTTP_PORT = 3001;
const WS_PORT = 3002;

// ─── Bootstrap (async to await DB init) ───
async function main() {
  // ─── Initialize Database ───
  await initDatabase();

// ─── WebSocket Server (for React dashboard) ───
const wss = new WebSocketServer({ port: WS_PORT });
const wsClients = new Set<WebSocket>();

wss.on("connection", (ws: WebSocket) => {
  wsClients.add(ws);
  console.log(`[WS] Dashboard client connected (total: ${wsClients.size})`);

  // Send recent telemetry history on connect
  const history = getRecentTelemetry(50);
  const msg: WsMessage<TelemetryData[]> = { type: "history", payload: history.reverse() };
  ws.send(JSON.stringify(msg));

  ws.on("message", (raw: Buffer) => {
    try {
      const parsed = JSON.parse(raw.toString());
      if (parsed.type === "command") {
        sendCommand(parsed.payload as DeviceCommand);
      }
    } catch (err) {
      console.error("[WS] Bad message:", (err as Error).message);
    }
  });

  ws.on("close", () => {
    wsClients.delete(ws);
    console.log(`[WS] Dashboard client disconnected (total: ${wsClients.size})`);
  });
});

function wsBroadcast(data: string): void {
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

console.log(`[WS] WebSocket server running on ws://localhost:${WS_PORT}`);

// ─── Initialize MQTT Broker ───
initMqttBroker(wsBroadcast);

// ─── HTTP Server (pure Node.js) ───
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url ?? "", true);
  const pathname = parsedUrl.pathname;

  // GET /api/telemetry
  if (req.method === "GET" && pathname === "/api/telemetry") {
    const limit = parseInt(parsedUrl.query.limit as string) || 100;
    const data = getRecentTelemetry(limit);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, data: data.reverse() }));
    return;
  }

  // POST /api/command
  if (req.method === "POST" && pathname === "/api/command") {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        const command: DeviceCommand = JSON.parse(body);
        sendCommand(command);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, message: "Command sent" }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Invalid JSON" }));
      }
    });
    return;
  }

  // GET /api/health
  if (req.method === "GET" && pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ success: true, status: "running", timestamp: new Date().toISOString() })
    );
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: false, error: "Not found" }));
});

server.listen(HTTP_PORT, () => {
  console.log(`[HTTP] API server running on http://localhost:${HTTP_PORT}`);
  console.log("\n=== GreenExtrude Server Ready ===\n");
});

} // end main()

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  closeDatabase();
  process.exit(0);
});
