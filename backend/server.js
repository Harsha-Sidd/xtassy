import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import multer from 'multer';
import db from './database.js';

const app = express();
const httpServer = createServer(app);

// Configure CORS for Express
const CORS_OPTIONS = {
  origin: (origin, callback) => callback(null, true),
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(CORS_OPTIONS));
app.use(express.json());

// Set up Multer for secure, memory-only file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for secure ephemeral files
  }
});

// --- HTTP API ENDPOINTS ---

// Server Health Check / Welcome Endpoint
app.get('/', (req, res) => {
  res.json({
    status: "HEALTHY",
    service: "Xtassy Ephemeral E2EE Backend Engine",
    version: "3.0.0",
    identity: "secure-node-tty0",
    protocol: "Express Ephemeral HTTP Polling Filesystem",
    zeroDiskFootprint: true,
    policy: "All data is stored purely in volatile heap memory. Wipes instantly on panic/nuke."
  });
});

// Ephemeral Encrypted File Upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Store the encrypted file buffer in our ephemeral DB
    const fileBlobId = db.storeFile(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    res.json({ fileBlobId });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Server upload failed' });
  }
});

// Retrieve Ephemeral Encrypted File
app.get('/api/file/:fileBlobId', (req, res) => {
  try {
    const { fileBlobId } = req.params;
    const fileData = db.getFile(fileBlobId);

    if (!fileData) {
      return res.status(404).json({ error: 'File not found or already burned' });
    }

    // Serve file binary
    res.setHeader('Content-Type', fileData.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileData.originalName}"`);
    res.send(fileData.buffer);
  } catch (error) {
    console.error('File retrieval error:', error);
    res.status(500).json({ error: 'Error downloading file' });
  }
});

// Helper: Verify Admin Session
const verifyAdmin = (token) => {
  return token && db.adminSessions.has(token);
};

// Unified Dispatcher Endpoint for HTTP Polling
app.post('/api', (req, res) => {
  try {
    const { action, username, adminToken } = req.body;
    if (!action) {
      return res.status(400).json({ error: 'Missing action' });
    }

    // 1. User Registration / Session Initiation
    if (action === 'register') {
      const { username: regUser } = req.body;
      const result = db.registerUser(regUser);
      return res.json(result);
    }

    // 2. Heartbeat Polling Loop
    if (action === 'poll') {
      if (!username) {
        return res.status(400).json({ error: 'Username required for polling' });
      }

      const cleanUsername = username.trim().toLowerCase();
      // Check if user is banned
      if (db.bannedUsers.has(cleanUsername)) {
        return res.json({ success: false, error: 'SESSION_EVICTED', reason: 'You have been kicked/banned by the administrator.' });
      }

      // Update activity presence with Ring clearance level
      const { ringLevel } = req.body;
      db.updateActivity(username, ringLevel);

      // Collect real-time polling bundle
      const onlineUsers = db.getOnlineUsers();
      const typing = db.getTypingIndicators();
      const messages = db.getMessagesForUser(username);

      // Auto mark incoming messages as delivered
      messages.forEach(msg => {
        if (msg.recipient.toLowerCase() === cleanUsername && msg.status === 'sent') {
          db.markAsDelivered(msg.id);
        }
      });

      return res.json({ success: true, onlineUsers, typing, messages });
    }

    // 3. Message Relaying
    if (action === 'send_message') {
      const { recipient, ciphertext, iv, salt, fileMeta, fileBlobId, burnTime, burnType } = req.body;
      if (!username || !recipient || !ciphertext || !iv || !salt) {
        return res.status(400).json({ error: 'Invalid message payload' });
      }

      const cleanUsername = username.trim().toLowerCase();
      if (db.bannedUsers.has(cleanUsername)) {
        return res.status(403).json({ error: 'Banned' });
      }

      const newMsg = db.addMessage({
        sender: username,
        recipient,
        ciphertext,
        iv,
        salt,
        fileMeta,
        fileBlobId,
        burnTime,
        burnType
      });

      return res.json({ success: true, message: newMsg });
    }

    // 4. Mark Read (countdown trigger)
    if (action === 'mark_read') {
      const { messageId } = req.body;
      if (!messageId) return res.status(400).json({ error: 'Message ID required' });

      const readMsg = db.markAsRead(messageId);
      if (readMsg) {
        return res.json({ success: true, message: readMsg });
      }
      return res.status(404).json({ error: 'Message not found' });
    }

    // 5. Explicit Client Burn Command
    if (action === 'burn_message') {
      const { messageId } = req.body;
      if (!messageId) return res.status(400).json({ error: 'Message ID required' });

      db.burnMessage(messageId);
      return res.json({ success: true });
    }

    // 6. Real-Time Typing Indicator
    if (action === 'typing_status') {
      const { recipient, isTyping } = req.body;
      if (!username || !recipient) return res.status(400).json({ error: 'Invalid typing state' });

      db.setTyping(username, recipient, isTyping);
      return res.json({ success: true });
    }

    // 7. Message Emoji Reactions
    if (action === 'react_message') {
      const { messageId, emoji } = req.body;
      if (!messageId || !username || !emoji) return res.status(400).json({ error: 'Invalid reaction request' });

      const updated = db.addReaction(messageId, username, emoji);
      if (updated) {
        return res.json({ success: true, message: updated });
      }
      return res.status(404).json({ error: 'Message not found' });
    }

    // 8. Self-Destruct Panic Purge
    if (action === 'panic_nuke') {
      console.log(`☢️ PANIC NUKE triggered! Wiping in-memory databases...`);
      db.files.clear();
      db.messages.clear();
      db.users.clear();
      db.typing.clear();
      db.adminSessions.clear();
      return res.json({ success: true });
    }

    // --- ADMINISTRATIVE ACTIONS (Requires Token Verification) ---

    // 9. Admin Login
    if (action === 'admin_login') {
      const { token } = req.body;
      const MASTER_TOKEN = process.env.ADMIN_TOKEN || 'xtassy-root-admin';
      
      console.log(`[AUTH] Incoming token: "${token}", Master token: "${MASTER_TOKEN}", Match: ${token === MASTER_TOKEN}`);
      if (token === MASTER_TOKEN) {
        const adminSessionToken = 'adm_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        db.adminSessions.add(adminSessionToken);
        console.log(`🔑 Root administrator authenticated successfully. Session registered.`);
        return res.json({ success: true, adminToken: adminSessionToken });
      } else {
        return res.status(401).json({ success: false, error: 'Invalid master administration key.' });
      }
    }

    // Secure Admin Dispatch Wrapper
    if (!verifyAdmin(adminToken)) {
      return res.status(403).json({ success: false, error: 'Access Denied: Administrator authentication required.' });
    }

    // 10. Admin Stats Retrieval (htop)
    if (action === 'admin_stats') {
      const heapUsed = process.memoryUsage().heapUsed;
      const heapTotal = process.memoryUsage().heapTotal;
      const uptime = Math.floor(process.uptime());
      
      const allUsers = Array.from(db.users.values()).map(u => ({
        username: u.username,
        online: u.online && (Date.now() - u.lastActive <= 6000),
        lastActive: u.lastActive,
        ringLevel: u.ringLevel || 3
      }));

      // Count active room keys
      const activeRooms = {};
      db.messages.forEach(msg => {
        const roomName = msg.recipient.startsWith('#') ? msg.recipient : 'Direct Chat';
        activeRooms[roomName] = (activeRooms[roomName] || 0) + 1;
      });

      return res.json({
        success: true,
        stats: {
          heapUsed,
          heapTotal,
          uptime,
          usersCount: allUsers.length,
          onlineCount: allUsers.filter(u => u.online).length,
          messagesCount: db.messages.size,
          filesCount: db.files.size
        },
        users: allUsers,
        rooms: activeRooms
      });
    }

    // 11. Admin Kick User
    if (action === 'admin_kick') {
      const { targetUsername } = req.body;
      if (!targetUsername) return res.status(400).json({ error: 'Target username required' });

      const cleanTarget = targetUsername.trim().toLowerCase();
      db.bannedUsers.add(cleanTarget); // Add to ban list to kick immediately
      
      const user = db.users.get(cleanTarget);
      if (user) {
        user.online = false;
      }
      console.log(`🥾 Administrator kicked user: ${targetUsername}`);
      return res.json({ success: true });
    }

    // 12. Admin Ban User
    if (action === 'admin_ban') {
      const { targetUsername } = req.body;
      if (!targetUsername) return res.status(400).json({ error: 'Target username required' });

      const cleanTarget = targetUsername.trim().toLowerCase();
      db.bannedUsers.add(cleanTarget);
      
      const user = db.users.get(cleanTarget);
      if (user) {
        user.online = false;
      }
      console.log(`🚫 Administrator banned user: ${targetUsername}`);
      return res.json({ success: true });
    }

    // 13. Admin Broadcast Alert
    if (action === 'admin_broadcast') {
      const { broadcastMessage } = req.body;
      if (!broadcastMessage) return res.status(400).json({ error: 'Message required' });

      // Append system message to the messages database
      const systemAlertMsg = db.addMessage({
        sender: '[SYSTEM_ALERT]',
        recipient: '#global', // Broadcast channel
        ciphertext: 'SYSTEM_BROADCAST_UNENCRYPTED_HEADER:' + broadcastMessage,
        iv: 'system-iv',
        salt: 'system-salt',
        burnTime: 60, // burns after 60s
        burnType: 'timer'
      });

      console.log(`📢 System Broadcast: ${broadcastMessage}`);
      return res.json({ success: true, message: systemAlertMsg });
    }

    // 14. Admin Nuke targeted room
    if (action === 'admin_nuke_room') {
      const { targetRoom } = req.body;
      if (!targetRoom) return res.status(400).json({ error: 'Target room required' });

      const cleanRoom = targetRoom.trim().toLowerCase();
      let count = 0;
      for (const [id, msg] of db.messages.entries()) {
        if (msg.recipient.toLowerCase() === cleanRoom || msg.sender.toLowerCase() === cleanRoom) {
          db.burnMessage(id);
          count++;
        }
      }
      console.log(`🔥 Administrator nuked room: ${targetRoom} (burned ${count} messages)`);
      return res.json({ success: true, burnedCount: count });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('Dispatcher error:', error);
    res.status(500).json({ error: 'Internal engine dispatch failure' });
  }
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Xtassy Ephemeral Backend running on port ${PORT}`);
  console.log(`[SECURITY] Master Admin Token configured: "${process.env.ADMIN_TOKEN || 'xtassy-root-admin'}"`);
});
