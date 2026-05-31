/**
 * Ephemeral In-Memory Database for Xtassy
 * Refactored for pure HTTP Polling + Admin Console and Ephemeral Privacy Features.
 * Designed for maximum privacy - no sensitive data is ever written to disk.
 */

class EphemeralDatabase {
  constructor() {
    // Maps username (lowercase) -> { username, online: boolean, lastActive: number }
    this.users = new Map();
    
    // Maps messageId -> { id, sender, recipient, ciphertext, iv, salt, fileMeta, fileBlobId, burnTime, burnType, panicWordHash, status, createdAt, readAt }
    this.messages = new Map();

    // Map to store encrypted temporary file uploads: fileBlobId -> { buffer, mimeType, originalName }
    this.files = new Map();

    // Maps sender (lowercase) -> { recipient: string, timestamp: number }
    this.typing = new Map();

    // Set of active authenticated admin tokens
    this.adminSessions = new Set();

    // Set of banned user handles (lowercase)
    this.bannedUsers = new Set();

    // Start proactive backend-enforced auto-burn intervals (runs every 1.5 seconds)
    this.startAutoBurnInterval();
  }

  // --- USER METHODS ---
  
  registerUser(username, ringLevel = 3) {
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) return { success: false, error: 'Username is empty' };

    if (this.bannedUsers.has(cleanUsername)) {
      return { success: false, error: 'Access denied: User is banned by system administrator.' };
    }

    this.users.set(cleanUsername, {
      username: username.trim(), // Preserve original casing for UI display
      online: true,
      lastActive: Date.now(),
      ringLevel: parseInt(ringLevel) || 3
    });

    return { success: true, username: username.trim() };
  }

  updateActivity(username, ringLevel) {
    const cleanUsername = username.trim().toLowerCase();
    const user = this.users.get(cleanUsername);
    if (user) {
      user.online = true;
      user.lastActive = Date.now();
      if (typeof ringLevel === 'number') {
        user.ringLevel = ringLevel;
      }
    } else {
      // Auto register if user polls but was not registered (e.g. server rebooted)
      this.registerUser(username, ringLevel);
    }
  }

  getOnlineUsers() {
    const list = [];
    const now = Date.now();

    for (const [key, user] of this.users.entries()) {
      // Auto offline if they missed polls for more than 6 seconds
      if (now - user.lastActive > 6000) {
        user.online = false;
      }
      if (user.online) {
        list.push({ username: user.username, ringLevel: user.ringLevel || 3 });
      }
    }
    return list;
  }

  getUserSocket(username) {
    // Legacy mapping (returning true/false for online check)
    const user = this.users.get(username.trim().toLowerCase());
    return user && user.online;
  }

  // --- TYPING METHODS ---

  setTyping(sender, recipient, isTyping) {
    const cleanSender = sender.trim().toLowerCase();
    if (isTyping) {
      this.typing.set(cleanSender, {
        recipient: recipient.trim().toLowerCase(),
        timestamp: Date.now()
      });
    } else {
      this.typing.delete(cleanSender);
    }
  }

  getTypingIndicators() {
    const active = {};
    const now = Date.now();

    for (const [sender, data] of this.typing.entries()) {
      // Typing expires after 4 seconds of inactivity
      if (now - data.timestamp < 4000) {
        active[sender] = data.recipient;
      } else {
        this.typing.delete(sender);
      }
    }
    return active;
  }

  // --- MESSAGE METHODS ---

  addMessage(msg) {
    const messageId = 'msg_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    
    const message = {
      id: messageId,
      sender: msg.sender,
      recipient: msg.recipient,
      ciphertext: msg.ciphertext,
      iv: msg.iv,
      salt: msg.salt,
      fileMeta: msg.fileMeta || null, // Encrypted file metadata (name, size, type)
      fileBlobId: msg.fileBlobId || null, // Key to retrieve encrypted file binary
      burnTime: parseInt(msg.burnTime) || 10, // countdown in seconds
      burnType: msg.burnType || 'timer', // 'timer' | 'read' | 'close' | 'panic'
      status: 'sent',
      createdAt: Date.now(),
      readAt: null,
      reactions: {} // Maps username -> emoji
    };

    this.messages.set(messageId, message);
    return message;
  }

  addReaction(messageId, username, emoji) {
    const msg = this.messages.get(messageId);
    if (!msg) return null;

    if (!msg.reactions) {
      msg.reactions = {};
    }

    // Toggle reaction
    if (msg.reactions[username] === emoji) {
      delete msg.reactions[username];
    } else {
      msg.reactions[username] = emoji;
    }

    return msg;
  }

  markAsDelivered(messageId) {
    const msg = this.messages.get(messageId);
    if (msg && msg.status === 'sent') {
      msg.status = 'delivered';
      return true;
    }
    return false;
  }

  markAsRead(messageId) {
    const msg = this.messages.get(messageId);
    if (msg && msg.status !== 'read') {
      msg.status = 'read';
      msg.readAt = Date.now();
      return msg;
    }
    return null;
  }

  getMessagesForUser(username) {
    const cleanUser = username.trim().toLowerCase();
    const list = [];
    const now = Date.now();

    for (const [id, msg] of this.messages.entries()) {
      const rec = msg.recipient.toLowerCase();
      const send = msg.sender.toLowerCase();

      // Check if message belongs to this conversation (sent or received by user)
      if (rec === cleanUser || send === cleanUser || rec.startsWith('#')) {
        // If message is read and timer is expired, burn it after a 2.5s client-sync grace period
        if (msg.status === 'read' && msg.readAt) {
          const elapsed = (now - msg.readAt) / 1000;
          if (msg.burnType === 'timer' && elapsed >= (msg.burnTime + 2.5)) {
            this.burnMessage(id);
            continue;
          }
          if (msg.burnType === 'read' && elapsed >= 2.5) {
            this.burnMessage(id);
            continue;
          }
        }
        list.push(msg);
      }
    }
    return list;
  }

  burnMessage(messageId) {
    const msg = this.messages.get(messageId);
    if (msg) {
      if (msg.fileBlobId) {
        this.files.delete(msg.fileBlobId);
      }
      this.messages.delete(messageId);
      return true;
    }
    return false;
  }

  // --- FILE METHODS ---

  storeFile(fileBuffer, mimeType, originalName) {
    const fileBlobId = 'file_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    this.files.set(fileBlobId, {
      buffer: fileBuffer,
      mimeType,
      originalName
    });
    return fileBlobId;
  }

  getFile(fileBlobId) {
    return this.files.get(fileBlobId);
  }

  deleteFile(fileBlobId) {
    return this.files.delete(fileBlobId);
  }

  // --- CLEANUP SERVICES ---

  startAutoBurnInterval() {
    setInterval(() => {
      const now = Date.now();
      
      // 1. Clean up messages that have finished their burn conditions
      for (const [id, msg] of this.messages.entries()) {
        const recipientName = msg.recipient.toLowerCase();
        const recipientUser = this.users.get(recipientName);

        // A. Burn on Read & Timer Auto-Burn with 2.5s grace period
        if (msg.status === 'read' && msg.readAt) {
          const elapsed = (now - msg.readAt) / 1000;
          if (msg.burnType === 'timer' && elapsed >= (msg.burnTime + 2.5)) {
            this.burnMessage(id);
          } else if (msg.burnType === 'read' && elapsed >= 2.5) {
            this.burnMessage(id);
          }
        }

        // B. Burn on Close (when recipient goes offline)
        if (msg.burnType === 'close' && !recipientName.startsWith('#')) {
          if (recipientUser && !recipientUser.online) {
            this.burnMessage(id);
          }
        }

        // C. Clean up unread messages older than 24 hours (security policy)
        if (msg.status !== 'read' && (now - msg.createdAt) > 24 * 60 * 60 * 1000) {
          this.burnMessage(id);
        }
      }
    }, 1500);
  }
}

export default new EphemeralDatabase();
