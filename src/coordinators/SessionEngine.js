const GameSession = require('../domain/GameSession');
const { nanoid } = require('nanoid'); 

class SessionEngine {
    constructor() {
        this.activeSessions = new Map();
    }

    initializeSession(adminId, config, io) { // <-- Add 'io' here
        const sessionId = nanoid(6).toLowerCase();
        const newSession = new GameSession(sessionId, adminId, config, io); // <-- Pass 'io' here
        this.activeSessions.set(sessionId, newSession);
        return newSession;
    }

    // fetchSession(sessionId) {
    //     return this.activeSessions.get(sessionId);
    // }
    
     fetchSession(sessionId) {
     const normalizedId = String(sessionId || '').trim().toLowerCase();
     return this.activeSessions.get(normalizedId);
     }



    terminateSession(sessionId) {
        this.activeSessions.delete(sessionId);
    }
}

module.exports = new SessionEngine();