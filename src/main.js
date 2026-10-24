
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sessionEngine = require('./coordinators/SessionEngine');

const app = express();

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Normalize Room ID consistently
const normalizeRoomId = (roomId) =>
    String(roomId || '').trim().toLowerCase();

io.on('connection', (socket) => {
    console.log(`[+] New connection established: ${socket.id}`);

    // CREATE ROOM
    socket.on('create_room', (payload, callback) => {
        try {
            const { hostName, settings } = payload || {};

            const session = sessionEngine.initializeSession(
                socket.id,
                settings,
                io
            );

            console.log(
                `Session created: ${session.sessionId} by ${hostName}`
            );

            if (typeof callback === 'function') {
                callback({
                    success: true,
                    roomId: session.sessionId
                });
            }
        } catch (error) {
            console.error('Create room error:', error.message);

            if (typeof callback === 'function') {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });

    // JOIN ROOM
    socket.on('join_room', (payload, callback) => {
        try {
            const { roomId, playerName } = payload || {};
            const normalizedRoomId = normalizeRoomId(roomId);

            console.log(
                'Join requested:',
                JSON.stringify(normalizedRoomId)
            );

            console.log(
                'Available rooms:',
                [...sessionEngine.activeSessions.keys()]
            );

            if (!normalizedRoomId) {
                throw new Error('Room ID is required');
            }

            const session =
                sessionEngine.fetchSession(normalizedRoomId);

            if (!session) {
                throw new Error('Session unavailable or expired');
            }

            session.joinSession(socket.id, playerName);

            socket.join(normalizedRoomId);

            io.to(normalizedRoomId).emit(
                'update_players',
                session.getParticipantRoster()
            );

            socket.to(normalizedRoomId).emit('chat_message', {
                playerName: 'System',
                text: `${playerName} joined the game!`,
                type: 'system'
            });

            if (typeof callback === 'function') {
                callback({ success: true });
            }
        } catch (error) {
            console.error('Join room error:', error.message);

            if (typeof callback === 'function') {
                callback({
                    success: false,
                    message: error.message
                });
            }
        }
    });

    // START GAME
    socket.on('start_game', (payload, callback) => {
        try {
            const normalizedRoomId =
                normalizeRoomId(payload?.roomId);

            const session =
                sessionEngine.fetchSession(normalizedRoomId);

            if (!session) {
                throw new Error('Session not found');
            }

            if (session.adminId === socket.id) {
                session.startGame();

                if (typeof callback === 'function') {
                    callback({ success: true });
                }
            } else {
                throw new Error('Only the host can start the game');
            }
        } catch (error) {
            console.error('Start game error:', error.message);

            if (typeof callback === 'function') {
                callback({
                    success: false,
                    message: error.message
                });
            } else {
                socket.emit('game_error', {
                    message: error.message
                });
            }
        }
    });

    // DRAWING SYNC
    socket.on('draw_data', (payload) => {
        const { roomId, stroke } = payload || {};
        const normalizedRoomId = normalizeRoomId(roomId);
        const session = sessionEngine.fetchSession(normalizedRoomId);

        if (
            session &&
            session.matchState.activeDrawerId === socket.id
        ) {
            session.saveCanvasStroke(stroke);
            socket.to(normalizedRoomId).emit('draw_data', stroke);
        }
    });

    // CLEAR CANVAS
    socket.on('canvas_clear', (payload) => {
        const normalizedRoomId =
            normalizeRoomId(payload?.roomId);

        const session =
            sessionEngine.fetchSession(normalizedRoomId);

        if (
            session &&
            session.matchState.activeDrawerId === socket.id
        ) {
            session.clearCanvas();
            socket.to(normalizedRoomId).emit('canvas_clear');
        }
    });

    // UNDO CANVAS
    socket.on('undo_canvas', (payload) => {
        const { canvasState } = payload || {};
        const normalizedRoomId =
            normalizeRoomId(payload?.roomId);

        const session =
            sessionEngine.fetchSession(normalizedRoomId);

        if (
            session &&
            session.matchState.activeDrawerId === socket.id
        ) {
            socket.to(normalizedRoomId).emit(
                'undo_canvas',
                canvasState
            );
        }
    });

    // CHOOSE WORD
    socket.on('choose_word', (payload) => {
        const { word } = payload || {};
        const normalizedRoomId =
            normalizeRoomId(payload?.roomId);

        const session =
            sessionEngine.fetchSession(normalizedRoomId);

        if (session) {
            session.selectWord(socket.id, word);
        }
    });

    // CHAT AND GUESSING
    socket.on('guess', (payload) => {
        const { text } = payload || {};
        const normalizedRoomId =
            normalizeRoomId(payload?.roomId);

        const session =
            sessionEngine.fetchSession(normalizedRoomId);

        if (session) {
            const isCorrect = session.processGuess(
                socket.id,
                text
            );

            if (!isCorrect) {
                const participant =
                    session.activeParticipants.get(socket.id);

                io.to(normalizedRoomId).emit('chat_message', {
                    playerId: socket.id,
                    playerName: participant
                        ? participant.displayName
                        : 'Unknown',
                    text
                });
            }
        }
    });

    // DISCONNECT
    socket.on('disconnect', () => {
        console.log(`[-] Connection lost: ${socket.id}`);
    });
});

// HEALTH CHECK
app.get('/', (req, res) => {
    res.send('Skribbl Backend is Awake!');
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
    console.log(`Websocket Engine running on port ${PORT}`);
});
