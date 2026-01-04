import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 2e7 // 20 MB limit
});

const rooms = new Map();

// Clean up inactive rooms every minute
setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms.entries()) {
        if (now - room.lastActive > 3600000) { // Delete after 1 hour of inactivity
            rooms.delete(id);
        }
    }
}, 60000);

const Security = {
    generateId: () => crypto.randomBytes(8).readBigUInt64BE(0).toString(),

    verify: (clientToken, storedServerHash) => {
        if (!clientToken || typeof clientToken !== 'string') return false;
        // Client: S = HMAC(Key=T, Data='server_verify_purpose')
        // Server: Verify S_stored == HMAC(Key=T_received, Data='server_verify_purpose')
        // T_received is hex string, convert to buffer for Key
        const expectedHash = crypto.createHmac('sha256', Buffer.from(clientToken, 'hex'))
            .update("server_verify_purpose")
            .digest();
        const actualHash = Buffer.from(storedServerHash, 'hex');
        return expectedHash.length === actualHash.length &&
            crypto.timingSafeEqual(expectedHash, actualHash);
    }
};

app.post('/api/room/create', (req, res) => {
    const { serverHash } = req.body;
    if (!serverHash || typeof serverHash !== 'string' || serverHash.length > 128) {
        return res.status(400).send("Invalid params");
    }

    const chatId = Security.generateId();
    if (rooms.has(chatId)) {
        return res.status(400).send("Room already exists");
    }

    rooms.set(chatId, {
        serverHash,
        createdAt: Date.now(),
        lastActive: Date.now()
    });

    console.log(`Created room ${chatId}`);
    res.json({ chatId });
});

io.use((socket, next) => {
    const { chatId, token, encryptedUsername } = socket.handshake.auth;
    let { clientId } = socket.handshake.auth;
    const room = rooms.get(chatId);

    if (room && Security.verify(token, room.serverHash)) {
        if (!encryptedUsername || typeof encryptedUsername !== 'string' || encryptedUsername.length > 256) {
            return next(new Error("Invalid encrypted username"));
        }

        // If no clientId provided by client, generate a new one server-side
        if (!clientId) {
            clientId = crypto.randomUUID();
            socket.isNewSession = true; // Mark as new so we can send it back
        }

        socket.chatId = chatId;
        socket.encryptedUsername = encryptedUsername;
        socket.clientId = clientId; 
        return next();
    }
    next(new Error("Authentication failed"));
});

io.on('connection', async (socket) => {
    const { chatId, encryptedUsername, clientId } = socket;

    // Send the assigned clientId back to the client if it was generated server-side
    // or just always ensure client has the correct one
    socket.emit('session_set', clientId);

    // 1. Check for zombie connections with same clientId in this room
    if (clientId) {
        const sockets = await io.in(chatId).fetchSockets();
        for (const s of sockets) {
            if (s.clientId === clientId && s.id !== socket.id) {
                // Found a ghost connection from same user. Disconnect it.
                // Note: fetchSockets() returns remote instances, we need the local socket to disconnect
                const zombieSocket = io.sockets.sockets.get(s.id);
                if (zombieSocket) {
                    zombieSocket.disconnect(true); // Force disconnect
                    console.log(`Cleaned up zombie socket ${s.id} for user ${clientId}`);
                }
            }
        }
    }

    socket.join(chatId);

    // Update room activity
    const room = rooms.get(chatId);
    if (room) room.lastActive = Date.now();

    console.log(`User connected to ${chatId}`);

    // Send current user list to the new user
    const sockets = await io.in(chatId).fetchSockets();
    const users = sockets.map(s => ({ id: s.id, encryptedUsername: s.encryptedUsername }));
    socket.emit('room_users', users);

    // Notify others
    socket.to(chatId).emit('user_joined', { id: socket.id, encryptedUsername });

    socket.on('msg', (payload) => {
        const room = rooms.get(chatId);
        if (room) room.lastActive = Date.now();

        socket.to(chatId).emit('msg', payload);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected from ${chatId}`);
        socket.to(chatId).emit('user_left', { id: socket.id, encryptedUsername });
    });
});

server.listen(3001, () => console.log('Server on :3001'));
