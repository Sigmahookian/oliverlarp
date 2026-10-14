-- Run in your executor. Keep the token private; do not commit a filled-in copy.
local TOKEN = "PASTE_YOUR_RAILWAY_BRIDGE_TOKEN_HERE"
local URL = "wss://oliverlarp-production.up.railway.app/ws?room=main"
assert(TOKEN ~= "PASTE_YOUR_RAILWAY_BRIDGE_TOKEN_HERE", "Set TOKEN to Railway's BRIDGE_TOKEN")

local HttpService = game:GetService("HttpService")
local environment = getgenv()
local websocketApi = WebSocket or websocket
assert(websocketApi and websocketApi.connect, "This executor needs WebSocket.connect")

if environment.RailwayBridge then
    pcall(function() environment.RailwayBridge:Close() end)
end

local socket = websocketApi.connect(URL)
local bridge = { Status = "authenticating", MessageCount = 0 }
environment.RailwayBridge = bridge

function bridge:Send(message)
    assert(self.Status == "connected", "Bridge is not connected yet")
    assert(type(message) == "string" and #message > 0 and #message <= 1000, "Send 1-1000 characters")
    socket:Send(HttpService:JSONEncode({ message = message }))
end

function bridge:Close()
    self.Status = "closed"
    socket:Close()
end

socket.OnMessage:Connect(function(raw)
    local ok, payload = pcall(HttpService.JSONDecode, HttpService, raw)
    if not ok or type(payload) ~= "table" then return end
    if payload.type == "connected" then
        bridge.Status = "connected"
        bridge.ConnectionId = payload.connectionId
        print("Railway bridge connected:", payload.room)
    elseif payload.type == "message" then
        bridge.MessageCount += 1
        bridge.LastMessage = payload
        print("Railway bridge message:", payload.message)
    elseif payload.type == "error" then
        warn("Railway bridge:", payload.error)
    end
end)

socket.OnClose:Connect(function()
    bridge.Status = "closed"
    print("Railway bridge closed")
end)

socket:Send(HttpService:JSONEncode({ type = "auth", token = TOKEN }))

-- Once connected, send with:
-- getgenv().RailwayBridge:Send("hello")
-- Disconnect with:
-- getgenv().RailwayBridge:Close()
