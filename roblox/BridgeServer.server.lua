-- Place this Script in ServerScriptService.
-- Create two Creator Hub secrets: BridgeBaseUrl (example: https://your-service.up.railway.app)
-- and BridgeToken (the same value as Railway's BRIDGE_TOKEN). Enable Allow HTTP Requests.

local HttpService = game:GetService("HttpService")

local BASE_URL = HttpService:GetSecret("BridgeBaseUrl")
local AUTHORIZATION = HttpService:GetSecret("BridgeToken"):AddPrefix("Bearer ")
local ROOM = "main"
local POLL_SECONDS = 3
local cursor = 0

local function request(method, url, body)
    local options = {
        Url = url,
        Method = method,
        Headers = {
            ["Authorization"] = AUTHORIZATION,
            ["Content-Type"] = "application/json",
        },
    }
    if body then
        options.Body = HttpService:JSONEncode(body)
    end
    return HttpService:RequestAsync(options)
end

local function sendMessage(message)
    local url = BASE_URL:AddSuffix("/api/messages")
    return request("POST", url, { room = ROOM, message = message })
end

local function pollMessages()
    local url = BASE_URL:AddSuffix("/api/messages?room=" .. ROOM .. "&after=" .. tostring(cursor))
    return request("GET", url)
end

-- Example: publish a test message from the Roblox server.
-- local result = sendMessage("hello from Roblox")
-- print(result.StatusCode, result.Body)

while true do
    local ok, response = pcall(pollMessages)
    if ok and response.Success then
        local decodedOk, payload = pcall(function()
            return HttpService:JSONDecode(response.Body)
        end)
        if decodedOk and type(payload.messages) == "table" then
            for _, message in ipairs(payload.messages) do
                cursor = math.max(cursor, message.id or cursor)
                print("Bridge message:", message.sender, message.message)
            end
        end
    else
        warn("Bridge poll failed:", ok and response.StatusCode or response)
    end
    task.wait(POLL_SECONDS)
end
