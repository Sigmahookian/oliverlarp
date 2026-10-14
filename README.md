# Railway Roblox message bridge

This project runs a WebSocket room relay on Railway and exposes matching HTTPS endpoints for Roblox **server Scripts**. It keeps messages in memory (up to the latest 100 per room), so messages are lost when the service restarts.

## Railway

1. Link this repository to a Railway service. The service root should be the repository root.
2. Railway detects `package.json` and runs `npm start`.
3. Add a Railway variable named `BRIDGE_TOKEN` with a long random value. Keep it out of GitHub.
4. Generate a public Railway domain for the service. The WebSocket URL is `wss://YOUR-DOMAIN/ws?room=main`; the HTTP API base is `https://YOUR-DOMAIN`.

WebSocket clients authenticate with `Authorization: Bearer <BRIDGE_TOKEN>`. The server refuses WebSocket and message API connections until `BRIDGE_TOKEN` is set. `/health` is public and only reports whether the variable exists.

## Roblox server scripts

Roblox's normal in-experience API does not provide a general persistent WebSocket client. Put `roblox/BridgeServer.server.lua` in `ServerScriptService`, set the `BridgeBaseUrl` and `BridgeToken` secrets in Creator Hub, and enable **Allow HTTP Requests** in Experience Settings. The Roblox example uses HTTPS `POST`/polling to the same room; browser or other WebSocket clients can connect to `/ws` for live messages.

Use this only from trusted server-side code. Never put `BRIDGE_TOKEN` in a `LocalScript`, a public repository, or client-visible source. This relay is intentionally small and in-memory; it is not a durable queue.
