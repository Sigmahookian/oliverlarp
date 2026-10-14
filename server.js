const http = require("node:http");
const { WebSocketServer, WebSocket } = require("ws");
const { createRoomStore } = require("./src/room-store");
const { hasValidBearerToken } = require("./src/auth");
const { readJson, sendJson } = require("./src/http-utils");

const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 8 * 1024;
const store = createRoomStore({ maxMessagesPerRoom: 100 });

function isAuthorized(request) {
  return hasValidBearerToken(request.headers.authorization, process.env.BRIDGE_TOKEN || "");
}

function validRoom(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,32}$/.test(value);
}

function routeHttp(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, { ok: true, bridgeTokenConfigured: Boolean(process.env.BRIDGE_TOKEN) });
  }

  if (!isAuthorized(request)) {
    return sendJson(response, 401, { error: "Unauthorized" });
  }

  if (request.method === "GET" && url.pathname === "/api/messages") {
    const room = url.searchParams.get("room") || "main";
    const after = Number(url.searchParams.get("after") || 0);
    if (!validRoom(room) || !Number.isSafeInteger(after) || after < 0) {
      return sendJson(response, 400, { error: "Invalid room or cursor" });
    }
    return sendJson(response, 200, { messages: store.listAfter(room, after) });
  }

  if (request.method === "POST" && url.pathname === "/api/messages") {
    readJson(request, MAX_BODY_BYTES).then((body) => {
      const room = body.room || "main";
      if (!validRoom(room) || typeof body.message !== "string" || body.message.length < 1 || body.message.length > 1000) {
        return sendJson(response, 400, { error: "room must be 1-32 letters/numbers/_/-, message must be 1-1000 characters" });
      }
      const message = store.publish(room, body.message, "https");
      sendJson(response, 201, { message });
    }).catch((error) => {
      sendJson(response, error.statusCode || 400, { error: error.message || "Invalid JSON body" });
    });
    return;
  }

  return sendJson(response, 404, { error: "Not found" });
}

const server = http.createServer(routeHttp);
const websocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY_BYTES });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname !== "/ws") {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  if (!process.env.BRIDGE_TOKEN ||
      (request.headers.authorization && !isAuthorized(request))) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  if (websocketServer.clients.size >= 256) {
    socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  const room = url.searchParams.get("room") || "main";
  if (!validRoom(room)) {
    socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(request, socket, head, (client) => {
    websocketServer.emit("connection", client, request, room, isAuthorized(request));
  });
});

websocketServer.on("connection", (client, _request, room, authorized) => {
  let sentInWindow = 0;
  let windowStarted = Date.now();
  let connectionId = null;
  let authTimer;
  function authenticate() {
    clearTimeout(authTimer);
    connectionId = store.addSocket(room, client);
    client.send(JSON.stringify({ type: "connected", room, connectionId }));
  }
  if (authorized) {
    authenticate();
  } else {
    authTimer = setTimeout(() => client.close(1008, "Authentication required"), 10_000);
  }

  client.on("message", (raw) => {
    const now = Date.now();
    if (now - windowStarted >= 10_000) {
      windowStarted = now;
      sentInWindow = 0;
    }
    sentInWindow += 1;
    if (sentInWindow > 50) {
      client.close(1008, "Rate limit exceeded");
      return;
    }

    let body;
    try {
      body = JSON.parse(raw.toString());
    } catch {
      client.send(JSON.stringify({ type: "error", error: "Send JSON: {\"message\":\"text\"}" }));
      return;
    }
    if (!connectionId) {
      if (body && body.type === "auth" && typeof body.token === "string" &&
          hasValidBearerToken("Bearer " + body.token, process.env.BRIDGE_TOKEN || "")) {
        authenticate();
      } else {
        client.close(1008, "Unauthorized");
      }
      return;
    }
    if (!body || typeof body.message !== "string" || body.message.length < 1 || body.message.length > 1000) {
      client.send(JSON.stringify({ type: "error", error: "message must be 1-1000 characters" }));
      return;
    }
    store.publish(room, body.message, connectionId);
  });

  function cleanup() {
    clearTimeout(authTimer);
    if (connectionId) store.removeSocket(room, connectionId);
  }
  client.on("close", cleanup);
  client.on("error", cleanup);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Bridge listening on port ${PORT}`);
});

process.on("SIGTERM", () => {
  websocketServer.clients.forEach((client) => client.close(1001, "Server shutting down"));
  server.close(() => process.exit(0));
});
