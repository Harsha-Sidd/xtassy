import React, { useState, useEffect, useRef } from 'react';
import { Send, Flame, Loader2, Terminal, Smile, Mic, File } from 'lucide-react';
import { BurnTimer } from './BurnTimer';
import { AudioRecorder } from './AudioRecorder';
import { AudioPlayer } from './AudioPlayer';
import { decryptText, encryptText, encryptFile, decryptFile, scrubImageMetadata, maskFilename } from '../crypto';
import type { EncryptedPayload } from '../crypto';

interface Message {
  id: string;
  sender: string;
  recipient: string;
  ciphertext: string;
  iv: string;
  salt: string;
  fileMeta: any;
  fileBlobId: string | null;
  burnTime: number;
  burnType?: 'timer' | 'read' | 'close' | 'panic';
  status: 'sent' | 'delivered' | 'read';
  createdAt: number;
  readAt: number | null;
  reactions?: { [username: string]: string };
  
  // Local state properties
  decryptedText?: string;
  decryptedFileUrl?: string;
  decryptedFileName?: string;
  decryptedFileType?: string;
  decryptionError?: boolean;
  sharedKeyUsed?: string;
}

interface ChatWindowProps {
  recipient: string;
  sender: string;
  sharedKey: string;
  messages: Message[];
  isRecipientTyping: boolean;
  onSendMessage: (payload: {
    recipient: string;
    ciphertext: string;
    iv: string;
    salt: string;
    fileMeta: EncryptedPayload | null;
    fileBlobId: string | null;
    burnTime: number;
    burnType?: 'timer' | 'read' | 'close' | 'panic';
    payloadBytes?: number;
  }) => void;
  onMarkRead: (messageId: string) => void;
  onBurnMessage: (messageId: string) => void;
  onTypingStatus: (isTyping: boolean) => void;
  onSetKey?: (key: string) => void;
  onReactMessage?: (messageId: string, emoji: string) => void;
  onPanicNuke?: () => void;
  latency?: number | null;
  onBack?: () => void;
  isMobile?: boolean;
  isAdmin?: boolean;
  adminToken?: string | null;
  backendUrl?: string;
  ringLevel?: number;
  onElevateAdmin?: (token: string) => void;
  onlineUsersLevels?: { [username: string]: number };
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  recipient,
  sender,
  sharedKey,
  messages,
  isRecipientTyping,
  onSendMessage,
  onMarkRead,
  onBurnMessage,
  onTypingStatus,
  onSetKey,
  onReactMessage,
  onPanicNuke,
  latency,
  onBack,
  isMobile,
  isAdmin = false,
  adminToken = null,
  backendUrl = window.location.origin,
  ringLevel = 3,
  onElevateAdmin,
  onlineUsersLevels = {}
}) => {
  const [inputText, setInputText] = useState('');
  const [burnTime, setBurnTime] = useState<number>(10);
  const [burnType, setBurnType] = useState<'timer' | 'read' | 'close' | 'panic'>('timer');
  const [panicWord, setPanicWord] = useState<string>('nuke');
  const [decryptedMessages, setDecryptedMessages] = useState<Message[]>([]);
  const [showRecorder, setShowRecorder] = useState(false);
  const [activeReactionId, setActiveReactionId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState<any | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bubbleRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [decryptedMessages, isRecipientTyping]);

  // System print local feedback utility
  const printSystemFeedback = (text: string) => {
    const feedbackMsg: Message = {
      id: 'sys_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now(),
      sender: 'system',
      recipient: sender,
      ciphertext: '',
      iv: '',
      salt: '',
      fileMeta: null,
      fileBlobId: null,
      burnTime: 0,
      status: 'read',
      createdAt: Date.now(),
      readAt: null,
      decryptedText: text,
      decryptionError: false
    };
    setDecryptedMessages((prev) => [...prev, feedbackMsg]);
  };

  // Handle decryption of messages
  useEffect(() => {
    const decryptAll = async () => {
      const processed = await Promise.all(
        messages.map(async (msg) => {
          const existing = decryptedMessages.find((m) => m.id === msg.id);
          if (
            existing &&
            existing.sharedKeyUsed === sharedKey &&
            existing.status === msg.status &&
            existing.readAt === msg.readAt &&
            JSON.stringify(existing.reactions) === JSON.stringify(msg.reactions)
          ) {
            return existing;
          }

          const updatedMsg = { ...msg, sharedKeyUsed: sharedKey };

          if (!sharedKey) {
            updatedMsg.decryptionError = true;
            return updatedMsg;
          }

          // Handle system alert broadcasts (unencrypted)
          if (msg.sender === '[SYSTEM_ALERT]') {
            updatedMsg.decryptedText = msg.ciphertext.replace('SYSTEM_BROADCAST_UNENCRYPTED_HEADER:', '');
            updatedMsg.decryptionError = false;
            return updatedMsg;
          }

          try {
            // Decrypt Text
            const text = await decryptText(
              { ciphertext: msg.ciphertext, iv: msg.iv, salt: msg.salt },
              sharedKey
            );
            updatedMsg.decryptedText = text;

            // FEATURE 6: Client-Side Panic Word Trigger
            // If message matches our panic word, immediately trigger local nuke purge!
            if (msg.burnType === 'panic' && text.toLowerCase().trim() === panicWord.toLowerCase().trim()) {
              setTimeout(() => {
                alert(`⚠️ [CRITICAL ALERT] Panic Word [${panicWord}] detected. Purging active E2EE buffers!`);
                if (onPanicNuke) onPanicNuke();
              }, 100);
            }

            // Decrypt File if exists
            if (msg.fileMeta && msg.fileBlobId) {
              const fileMetaJson = await decryptText(msg.fileMeta, sharedKey);
              const meta = JSON.parse(fileMetaJson);
              
              // Restore E2EE masked details
              updatedMsg.decryptedFileName = meta.originalName || meta.name;
              updatedMsg.decryptedFileType = meta.type;

              if (meta.type === 'voice') {
                updatedMsg.fileMeta = meta; 
              } else {
                // Fetch and decrypt encrypted, padded file
                const response = await fetch(`${backendUrl}/api/file/${msg.fileBlobId}`);
                if (response.ok) {
                  const encryptedArrayBuffer = await response.arrayBuffer();
                  
                  // Decrypt and unpad buffer client-side in-memory
                  const decryptedArrayBuffer = await decryptFile(
                    encryptedArrayBuffer,
                    meta.fileIv,
                    meta.fileSalt,
                    sharedKey
                  );

                  const blob = new Blob([decryptedArrayBuffer], { type: meta.type });
                  updatedMsg.decryptedFileUrl = URL.createObjectURL(blob);
                } else {
                  updatedMsg.decryptedText = "[Encrypted attachment was already burned]";
                }
              }
            }

            updatedMsg.decryptionError = false;
          } catch (err) {
            console.error('Decryption error for msg:', msg.id, err);
            updatedMsg.decryptionError = true;
          }

          return updatedMsg;
        })
      );

      processed.forEach((msg) => {
        const isGroup = msg.recipient.startsWith('#');
        const isIncoming = isGroup
          ? msg.sender.toLowerCase() !== sender.toLowerCase()
          : msg.recipient.toLowerCase() === sender.toLowerCase();

        if (isIncoming && msg.status !== 'read') {
          onMarkRead(msg.id);
        }
      });

      decryptedMessages.forEach((oldMsg) => {
        const stillExists = processed.some((newMsg) => newMsg.id === oldMsg.id);
        if (!stillExists && oldMsg.decryptedFileUrl) {
          URL.revokeObjectURL(oldMsg.decryptedFileUrl);
        }
      });

      setDecryptedMessages(processed);
    };

    decryptAll();
  }, [messages, sharedKey, sender, panicWord]);

  const handleSendAudio = async (fileBlobId: string, duration: number, fileMeta: any) => {
    if (!sharedKey) return;

    try {
      const encrypted = await encryptText(`📎 Shared secure voice memo (${duration}s)`, sharedKey);
      const encryptedMeta = await encryptText(JSON.stringify(fileMeta), sharedKey);

      onSendMessage({
        recipient,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: encrypted.salt,
        fileMeta: encryptedMeta,
        fileBlobId,
        burnTime,
        burnType,
        payloadBytes: encrypted.ciphertext.length + 100 * 1024
      });

      setShowRecorder(false);
    } catch (err) {
      console.error('Audio E2EE finalization failed:', err);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = inputText.trim();
    if (!rawInput) return;

    // INTERACTIVE CLI COMMAND PORT FOR ADMINISTRATORS
    if (isAdmin && rawInput.startsWith('/')) {
      const commandMatch = rawInput.match(/^\/?(help|clear|exit|burn|key|admin-users|admin-rooms|admin-kick|admin-ban|admin-broadcast|admin-nuke)(\s+(.*))?$/i);
      if (commandMatch) {
        const command = commandMatch[1].toLowerCase();
        const args = commandMatch[3]?.trim();

        if (command === 'clear') {
          setDecryptedMessages([]);
          setInputText('');
          onTypingStatus(false);
          return;
        }

        if (command === 'exit') {
          localStorage.removeItem('xtassy_username');
          window.location.reload();
          return;
        }

        if (command === 'burn') {
          const sec = parseInt(args);
          if (sec && [5, 10, 30, 60, 300].includes(sec)) {
            setBurnTime(sec);
            printSystemFeedback(`[SYSTEM] burn_timer set to ${sec} seconds.`);
          } else {
            printSystemFeedback(`[ERROR] Invalid duration. Syntax: burn <5|10|30|60|300>`);
          }
          setInputText('');
          onTypingStatus(false);
          return;
        }

        if (command === 'key') {
          if (args && onSetKey) {
            onSetKey(args);
            printSystemFeedback(`[SYSTEM] E2EE secure key locked and verified.`);
          } else {
            printSystemFeedback(`[ERROR] Passphrase required. Syntax: key <your_passphrase>`);
          }
          setInputText('');
          onTypingStatus(false);
          return;
        }

        // --- ROOT ADMINISTRATIVE TERMINAL ACTIONS ---

        if (command === 'admin-users') {
          try {
            const res = await fetch(`${backendUrl}/api`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'admin_stats', adminToken })
            });
            const data = await res.json();
            if (data.success) {
              const userTable = data.users.map((u: any) => {
                return `• usr: [${u.username}] -> ${u.online ? 'ONLINE (active)' : 'OFFLINE (away)'}`;
              }).join('\n');
              printSystemFeedback(`*** REGISTERED CORE SESSIONS ***\n${userTable}`);
            }
          } catch (err: any) {
            printSystemFeedback(`[ROOT ERROR] Stats sweep failed: ${err.message}`);
          }
          setInputText('');
          onTypingStatus(false);
          return;
        }

        if (command === 'admin-rooms') {
          try {
            const res = await fetch(`${backendUrl}/api`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'admin_stats', adminToken })
            });
            const data = await res.json();
            if (data.success) {
              const roomsTable = Object.entries(data.rooms).map(([room, count]) => {
                return `• path: [${room}] -> ${count} volatile envelopes`;
              }).join('\n');
              printSystemFeedback(`*** ACTIVE CRYPTOGRAPHIC CHANNELS ***\n${roomsTable || 'No paths cached'}`);
            }
          } catch (err: any) {
            printSystemFeedback(`[ROOT ERROR] Channel sweep failed: ${err.message}`);
          }
          setInputText('');
          onTypingStatus(false);
          return;
        }

        if (command === 'admin-kick') {
          if (!args) {
            printSystemFeedback('[ERROR] Target username required. Syntax: /admin-kick <username>');
          } else {
            try {
              const res = await fetch(`${backendUrl}/api`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'admin_kick', adminToken, targetUsername: args })
              });
              const data = await res.json();
              if (data.success) printSystemFeedback(`[ROOT SUCCESS] Session evicted: ${args}`);
            } catch (err: any) {
              printSystemFeedback(`[ROOT ERROR] Kick rejected: ${err.message}`);
            }
          }
          setInputText('');
          onTypingStatus(false);
          return;
        }

        if (command === 'admin-ban') {
          if (!args) {
            printSystemFeedback('[ERROR] Target username required. Syntax: /admin-ban <username>');
          } else {
            try {
              const res = await fetch(`${backendUrl}/api`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'admin_ban', adminToken, targetUsername: args })
              });
              const data = await res.json();
              if (data.success) printSystemFeedback(`[ROOT SUCCESS] Session permanently banned: ${args}`);
            } catch (err: any) {
              printSystemFeedback(`[ROOT ERROR] Ban rejected: ${err.message}`);
            }
          }
          setInputText('');
          onTypingStatus(false);
          return;
        }

        if (command === 'admin-broadcast') {
          if (!args) {
            printSystemFeedback('[ERROR] Broadcast warning string required. Syntax: /admin-broadcast <alert>');
          } else {
            try {
              const res = await fetch(`${backendUrl}/api`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'admin_broadcast', adminToken, broadcastMessage: args })
              });
              const data = await res.json();
              if (data.success) printSystemFeedback(`[ROOT SUCCESS] Warning broadcast: ${args}`);
            } catch (err: any) {
              printSystemFeedback(`[ROOT ERROR] Broadcast failed: ${err.message}`);
            }
          }
          setInputText('');
          onTypingStatus(false);
          return;
        }

        if (command === 'admin-nuke') {
          if (onPanicNuke) onPanicNuke();
          setInputText('');
          onTypingStatus(false);
          return;
        }

        if (command === 'help') {
          printSystemFeedback(
`*** XTASSY ROOT EXECUTIVE CLI HELP PANEL ***
clear                      - Clears the active chat screen locally
exit                       - Destroys active session & logs out
burn <sec>                 - Sets timer countdown (5, 10, 30, 60, 300)
key <pass>                 - Locks E2EE passphrase key instantly
/admin-users               - Lists registered online core sessions
/admin-rooms               - Lists active cryptographic paths in RAM
/admin-kick <username>     - Remotely evicts targeted handle session
/admin-ban <username>      - Bans user handle from polling registration
/admin-broadcast <warning> - Transmits systemic alert to all nodes
/admin-nuke                - Triggers total secure RAM stack purge`
          );
          setInputText('');
          onTypingStatus(false);
          return;
        }
      }
    }

    // In-place Administrative Root Elevation Command
    if (!isAdmin && rawInput.toLowerCase().startsWith('/admin ')) {
      const token = rawInput.replace(/^\/admin\s+/i, '').trim();
      try {
        const response = await fetch(`${backendUrl}/api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'admin_login', token })
        });
        
        const data = await response.json();
        if (data.success) {
          alert("🔑 [ROOT INTRUSION DETECTED] Administrative credentials verified. Session elevated to root.");
          if (onElevateAdmin) {
            onElevateAdmin(data.adminToken);
          }
        } else {
          printSystemFeedback("[ERROR] Invalid administrative credentials.");
        }
      } catch (err: any) {
        printSystemFeedback(`[ERROR] Administrative authentication failed: ${err.message}`);
      }
      setInputText('');
      onTypingStatus(false);
      return;
    }

    // regular user commands blocking
    if (!isAdmin && rawInput.startsWith('/')) {
      printSystemFeedback("[Access Denied] Command line slash commands are restricted strictly to root administrators.");
      setInputText('');
      onTypingStatus(false);
      return;
    }

    if (!sharedKey) return;

    try {
      // Client-side Encrypt text
      const encrypted = await encryptText(rawInput, sharedKey);
      
      onSendMessage({
        recipient,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        salt: encrypted.salt,
        fileMeta: null,
        fileBlobId: null,
        burnTime,
        burnType,
        payloadBytes: encrypted.ciphertext.length
      });

      setInputText('');
      onTypingStatus(false);
    } catch (err) {
      console.error('Encryption failed', err);
    }
  };

  // FEATURE 3 & FEATURE 7: Advanced E2EE File Transfer with Metadata Masking
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sharedKey) return;

    setUploading(true);
    try {
      // A. Scrub EXIF metadata client-side using Canvas rendering
      const cleanBlob = await scrubImageMetadata(file);

      // B. Mask original filename with generic generic format
      const maskedName = maskFilename(file.name);

      // C. Read binary ArrayBuffer
      const fileBuffer = await cleanBlob.arrayBuffer();

      // D. Client-side encrypt ArrayBuffer (auto-appends 256KB block padding)
      const encrypted = await encryptFile(fileBuffer, sharedKey);

      // E. Upload E2EE padded binary buffer
      const formData = new FormData();
      const encryptedBlob = new Blob([encrypted.encryptedData], { type: 'application/octet-stream' });
      formData.append('file', encryptedBlob, maskedName);

      const response = await fetch(`${backendUrl}/api/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Upload server rejected file');

      const { fileBlobId } = await response.json();

      // F. Encrypt File Metadata Payload (E2EE)
      const fileMetaPayload = {
        name: maskedName,
        originalName: file.name,
        size: file.size,
        type: file.type,
        fileIv: encrypted.iv,
        fileSalt: encrypted.salt
      };

      const encryptedMeta = await encryptText(JSON.stringify(fileMetaPayload), sharedKey);
      const encryptedMsgText = await encryptText(`📎 Shared attachment: [${file.name}]`, sharedKey);

      onSendMessage({
        recipient,
        ciphertext: encryptedMsgText.ciphertext,
        iv: encryptedMsgText.iv,
        salt: encryptedMsgText.salt,
        fileMeta: encryptedMeta,
        fileBlobId,
        burnTime,
        burnType,
        payloadBytes: encryptedBlob.size
      });

    } catch (err) {
      console.error('Secure attachment process failed', err);
      alert('Failed to securely process E2EE file transfer.');
    } finally {
      setUploading(false);
    }
  };

  const handleBurnTrigger = (messageId: string) => {
    onBurnMessage(messageId);
  };

  const burnPresets = [5, 10, 30, 60, 300];
  const activePresetIdx = burnPresets.indexOf(burnTime) !== -1 ? burnPresets.indexOf(burnTime) : 1;
  const activePreset = [
    { label: "Critical (5s)", color: "#ff0055" },
    { label: "Flash (10s)", color: "#ff3c00" },
    { label: "Dissolve (30s)", color: "#ffb000" },
    { label: "Evaporate (1m)", color: "#8be9fd" },
    { label: "Retain (5m)", color: "#00ff66" }
  ][activePresetIdx];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', border: '1px solid var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
      
      {/* Linux Window title bar */}
      <div className="terminal-window-header" style={{ height: 'auto', minHeight: '28px', padding: '6px 10px', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: 'none',
                border: '1px solid var(--border-color)',
                borderRadius: '2px',
                color: 'var(--color-primary)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.65rem',
                padding: '2px 6px',
                display: 'inline-flex',
                alignItems: 'center',
                marginRight: '4px',
                outline: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              &lt; [back]
            </button>
          )}
          <Terminal size={12} style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.7rem' }}>
            {isAdmin ? `root@tty1:[${recipient.toLowerCase()}]` : `${sender.toLowerCase()}@tty1:[${recipient.toLowerCase()}]`}
          </span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
          {onPanicNuke && (
            <button
              onClick={onPanicNuke}
              style={{
                background: 'none',
                border: 'none',
                color: '#ff0055',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '0.7rem',
                fontWeight: 'bold',
                textShadow: '0 0 6px #ff0055',
                outline: 'none'
              }}
              title="ENGAGE INSTANT DESTRUCTION"
            >
              [PANIC PURGE]
            </button>
          )}
          <div className="terminal-window-buttons">
            <div className="terminal-window-button minimize" />
            <div className="terminal-window-button maximize" />
            <div className="terminal-window-button close" />
          </div>
        </div>
      </div>

      {/* Terminal Room Header Controls */}
      <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between', borderTop: 0, borderLeft: 0, borderRight: 0, borderBottom: '1px solid var(--border-color)', borderRadius: 0, background: 'rgba(0,0,0,0.3)' }}>
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>$ cat secure_chat_status</span>
            <span style={{
              display: 'inline-block',
              padding: '1px 6px',
              background: '#171717',
              border: '1px solid var(--color-primary)',
              borderRadius: '2px',
              fontSize: '0.65rem',
              fontWeight: 'bold',
              color: 'var(--color-primary)',
              textTransform: 'uppercase'
            }}>
              [ {sharedKey ? 'AES-GCM-E2EE: SECURE' : 'UNLOCKED'} ]
            </span>
            {typeof latency === 'number' && (
              <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                latency: {latency}ms
              </span>
            )}
          </div>
        </div>

        {/* FEATURE 6: Ephemeral Policy Panel Selection */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          
          {/* Burn Type Toggle Selection */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>policy:</span>
            <select
              value={burnType}
              onChange={(e) => {
                const val = e.target.value;
                if (!isAdmin) {
                  if (val === 'read' && ringLevel > 2) {
                    alert("🔒 [ACCESS DENIED] Burn-on-Read policy is locked. Requires Ring 2 (operator) clearance or higher.");
                    return;
                  }
                  if (val === 'close' && ringLevel > 0) {
                    alert("🔒 [ACCESS DENIED] Burn-on-Close policy is locked. Requires Ring 0 (sysop) clearance or higher.");
                    return;
                  }
                  if (val === 'panic' && ringLevel > 0) {
                    alert("🔒 [ACCESS DENIED] Panic Word policy is locked. Requires Ring 0 (sysop) clearance or higher.");
                    return;
                  }
                }
                setBurnType(val as any);
              }}
              className="neon-input"
              style={{
                padding: '4px 8px',
                fontSize: '0.75rem',
                background: '#020202',
                color: 'var(--color-primary)',
                fontFamily: 'monospace',
                border: '1px solid var(--border-color)',
                borderRadius: '2px',
                cursor: 'pointer',
                outline: 'none',
                width: '120px'
              }}
            >
              <option value="timer">Timer Count</option>
              <option value="read" disabled={!isAdmin && ringLevel > 2}>Burn On Read {!isAdmin && ringLevel > 2 ? '🔒 (Ring 2)' : ''}</option>
              <option value="close" disabled={!isAdmin && ringLevel > 0}>Burn On Close {!isAdmin && ringLevel > 0 ? '🔒 (Ring 0)' : ''}</option>
              <option value="panic" disabled={!isAdmin && ringLevel > 0}>Panic Word {!isAdmin && ringLevel > 0 ? '🔒 (Ring 0)' : ''}</option>
            </select>
          </div>

          {/* Conditional Policy Variables Panel */}
          {burnType === 'timer' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Flame size={13} style={{ color: activePreset.color, filter: `drop-shadow(0 0 4px ${activePreset.color})` }} />
              <select
                value={burnTime}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isAdmin && ringLevel > 2 && (val === 5 || val === 60 || val === 300)) {
                    alert("🔒 [ACCESS DENIED] Critical (5s) and Retain (5m) timers require Ring 2 (operator) clearance or higher.");
                    return;
                  }
                  setBurnTime(val);
                }}
                className="neon-input"
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  background: '#020202',
                  color: activePreset.color,
                  textShadow: `0 0 4px ${activePreset.color}`,
                  fontFamily: 'monospace',
                  border: '1px solid var(--border-color)',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  outline: 'none',
                  width: '120px'
                }}
              >
                <option value={5} disabled={!isAdmin && ringLevel > 2} style={{ color: '#ff0055', background: '#020202' }}>Critical (5s) {!isAdmin && ringLevel > 2 ? '🔒' : ''}</option>
                <option value={10} style={{ color: '#ff3c00', background: '#020202' }}>Flash (10s)</option>
                <option value={30} style={{ color: '#ffb000', background: '#020202' }}>Dissolve (30s)</option>
                <option value={60} disabled={!isAdmin && ringLevel > 2} style={{ color: '#8be9fd', background: '#020202' }}>Evaporate (1m) {!isAdmin && ringLevel > 2 ? '🔒' : ''}</option>
                <option value={300} disabled={!isAdmin && ringLevel > 2} style={{ color: '#00ff66', background: '#020202' }}>Retain (5m) {!isAdmin && ringLevel > 2 ? '🔒' : ''}</option>
              </select>
            </div>
          )}

          {burnType === 'panic' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--color-accent)' }}>safe_word:</span>
              <input
                type="text"
                className="neon-input"
                value={panicWord}
                onChange={(e) => setPanicWord(e.target.value)}
                maxLength={10}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  background: '#020202',
                  color: 'var(--color-accent)',
                  width: '80px',
                  border: '1px solid var(--border-color)',
                  fontFamily: 'monospace',
                  outline: 'none'
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Messages Scrolling Panel */}
      <div 
        className="glass-panel" 
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          background: '#020502',
          border: 0,
          borderRadius: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {decryptedMessages.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>*** secure_room initialized. tty session linked. ***</p>
            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>*** all text encrypted client-side via PBKDF2/AES-GCM-256 ***</p>
            {isAdmin ? (
              <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--color-accent)' }}>
                *** root admin mode active. administrative prompt loaded below. ***
              </p>
            ) : (
              <p style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                *** E2EE messaging channel active. ***
              </p>
            )}
          </div>
        ) : (
          decryptedMessages.map((msg) => {
            if (msg.sender === 'system') {
              return (
                <div
                  key={msg.id}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    color: 'var(--color-text-secondary)',
                    padding: '6px 12px',
                    borderLeft: '2px solid var(--color-primary)',
                    background: 'rgba(255,255,255,0.02)',
                    margin: '8px 0',
                    width: '100%',
                    whiteSpace: 'pre-wrap',
                    textAlign: 'left'
                  }}
                >
                  {msg.decryptedText}
                </div>
              );
            }

            const isMe = msg.sender.toLowerCase() === sender.toLowerCase();
            const showTimer = msg.status === 'read' && msg.readAt && msg.burnType === 'timer';
            const showReadBurnIcon = msg.status === 'read' && msg.readAt && msg.burnType === 'read';

            // Check if locally expired (to prevent lingering during backend grace period)
            let isLocallyExpired = false;
            if (msg.status === 'read' && msg.readAt) {
              const elapsed = (Date.now() - msg.readAt) / 1000;
              if (msg.burnType === 'timer' && elapsed >= msg.burnTime) {
                isLocallyExpired = true;
              } else if (msg.burnType === 'read' && elapsed >= 1.5) {
                isLocallyExpired = true;
              }
            }

            if (isLocallyExpired) return null;

            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                  width: '100%',
                  position: 'relative',
                  fontFamily: 'monospace'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', maxWidth: '85%' }}>
                  
                  {/* Countdown Timer (Recipient View) */}
                  {!isMe && showTimer && (
                    <div style={{ marginTop: '2px' }}>
                      <BurnTimer
                        burnTime={msg.burnTime}
                        readAt={msg.readAt!}
                        onBurn={() => handleBurnTrigger(msg.id)}
                      />
                    </div>
                  )}

                  {!isMe && showReadBurnIcon && (
                    <div style={{ marginTop: '2px' }} title="Burn on Read countdown initiated...">
                      <Flame size={12} className="animate-pulse" style={{ color: 'var(--color-accent)' }} />
                    </div>
                  )}

                  {/* Floating Reaction Selector */}
                  {activeReactionId === msg.id && (
                    <div 
                      className="glass-panel" 
                      style={{
                        position: 'absolute',
                        top: '-36px',
                        left: isMe ? 'auto' : '8px',
                        right: isMe ? '8px' : 'auto',
                        display: 'flex',
                        gap: '6px',
                        padding: '4px 8px',
                        zIndex: 1000,
                        background: 'var(--bg-panel-solid)',
                        border: '1px solid var(--color-primary)',
                        borderRadius: '16px',
                        boxShadow: 'var(--glass-shadow)',
                        animation: 'fadeIn 0.1s'
                      }}
                    >
                      {['👍', '❤️', '🔥', '😂', '😮', '😢'].map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => {
                            if (onReactMessage) onReactMessage(msg.id, emoji);
                            setActiveReactionId(null);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            padding: '2px',
                            transition: 'transform 0.1s',
                            outline: 'none'
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Retro CLI Message bubble */}
                  <div
                    ref={(el) => { bubbleRefs.current[msg.id] = el; }}
                    className="message-bubble"
                    onDoubleClick={() => setActiveReactionId(activeReactionId === msg.id ? null : msg.id)}
                    style={{
                      position: 'relative',
                      padding: '8px 12px',
                      borderRadius: '2px',
                      background: msg.sender === '[SYSTEM_ALERT]' ? 'rgba(255,0,79,0.1)' : (isMe ? '#1c1c1c' : '#0a0a0a'),
                      border: '1px solid',
                      borderColor: msg.sender === '[SYSTEM_ALERT]' ? 'var(--color-accent)' : (isMe ? 'var(--color-primary)' : 'var(--border-color)'),
                      boxShadow: 'none',
                      color: msg.sender === '[SYSTEM_ALERT]' ? 'var(--color-accent)' : 'var(--color-primary)',
                      wordBreak: 'break-word',
                      paddingRight: '22px', 
                      cursor: 'pointer'
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveReactionId(activeReactionId === msg.id ? null : msg.id);
                      }}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-muted)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.4,
                        transition: 'opacity 0.2s',
                        outline: 'none'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = '0.4'}
                      title="React"
                    >
                      <Smile size={11} />
                    </button>

                    {/* Console Sender Prefix Tag inside bubble */}
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginBottom: '4px', borderBottom: '1px dashed var(--border-color)', paddingBottom: '3px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {msg.sender === '[SYSTEM_ALERT]' ? (
                        <span>⚠️ system@kernel</span>
                      ) : (
                        <>
                          <span>{isMe ? `${sender.toLowerCase()}@local` : `${msg.sender.toLowerCase()}@remote`}</span>
                          {(() => {
                            const uLower = msg.sender.toLowerCase();
                            const uRing = uLower === 'root' ? 'root' : (onlineUsersLevels && onlineUsersLevels[uLower] !== undefined ? onlineUsersLevels[uLower] : undefined);
                            
                            if (uRing === 'root') {
                              return <span style={{ fontSize: '0.55rem', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', borderRadius: '2px', padding: '0 2px', lineHeight: '1.2' }}>root</span>;
                            }
                            if (uRing !== undefined) {
                              const badgeName = uRing === 0 ? 'sysop' : uRing === 1 ? 'kernel' : uRing === 2 ? 'operator' : 'guest';
                              const badgeColor = uRing === 0 ? '#00ff66' : uRing === 1 ? '#8be9fd' : uRing === 2 ? '#ffb000' : '#888888';
                              return <span style={{ fontSize: '0.55rem', color: badgeColor, border: `1px solid ${badgeColor}`, borderRadius: '2px', padding: '0 2px', lineHeight: '1.2' }}>{badgeName}</span>;
                            }
                            return null;
                          })()}
                        </>
                      )}
                    </div>

                    {msg.decryptionError ? (
                      <span style={{ color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                        <span>[Decryption Error - check shared_key]</span>
                      </span>
                    ) : (
                      <>
                        {/* Text Content */}
                        {!msg.fileMeta && <p style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{msg.decryptedText}</p>}

                        {/* Voice Note E2EE Player */}
                        {msg.fileMeta && msg.fileMeta.type === 'voice' && (
                          <AudioPlayer
                            fileBlobId={msg.fileBlobId!}
                            fileMeta={msg.fileMeta}
                            sharedKey={sharedKey}
                            isBurned={msg.status === 'read' && msg.readAt !== null && msg.burnType === 'timer' && (Date.now() - msg.readAt!) / 1000 >= msg.burnTime}
                          />
                        )}

                        {/* File Attachment Renderer */}
                        {msg.fileMeta && msg.fileMeta.type !== 'voice' && msg.decryptedFileUrl && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px', marginTop: '6px' }}>
                            {msg.decryptedFileType?.startsWith('image/') ? (
                              <img
                                src={msg.decryptedFileUrl}
                                alt="Secure console attachment"
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: '200px',
                                  borderRadius: '2px',
                                  border: '1px solid var(--border-color)'
                                }}
                              />
                            ) : (
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                background: '#020502',
                                border: '1px dashed var(--border-color)',
                                padding: '6px 10px'
                              }}>
                                <File size={14} style={{ color: 'var(--color-secondary)' }} />
                                <span style={{ color: 'var(--color-primary)', fontSize: '0.75rem' }}>
                                  Attachment: {msg.decryptedFileName}
                                </span>
                              </div>
                            )}

                            <a
                              href={msg.decryptedFileUrl}
                              download={msg.decryptedFileName}
                              className="neon-button secondary"
                              style={{ padding: '4px 8px', fontSize: '0.7rem', textDecoration: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                            >
                              <span>[ DOWNLOAD BINARY ]</span>
                            </a>
                          </div>
                        )}

                        {/* Message Reactions */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div 
                            style={{ 
                              display: 'flex', 
                              gap: '4px', 
                              marginTop: '8px', 
                              flexWrap: 'wrap',
                              justifyContent: 'flex-start',
                              borderTop: '1px dashed var(--border-color)',
                              paddingTop: '6px'
                            }}
                          >
                            {Object.entries(msg.reactions).map(([user, emoji]) => (
                              <span 
                                key={user}
                                className="reaction-pop-bubble"
                                title={`Reacted by ${user}`}
                                style={{
                                  background: 'rgba(0,0,0,0.5)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '4px',
                                  padding: '1px 5px',
                                  fontSize: '0.65rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                <span>{emoji}</span>
                                <span style={{ fontSize: '0.55rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                                  {user.toLowerCase()}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Countdown Timer (Sender View) */}
                  {isMe && showTimer && (
                    <div style={{ marginTop: '2px' }}>
                      <BurnTimer
                        burnTime={msg.burnTime}
                        readAt={msg.readAt!}
                        onBurn={() => handleBurnTrigger(msg.id)}
                      />
                    </div>
                  )}

                  {isMe && showReadBurnIcon && (
                    <div style={{ marginTop: '2px' }} title="Burn on Read countdown initiated...">
                      <Flame size={12} className="animate-pulse" style={{ color: 'var(--color-accent)' }} />
                    </div>
                  )}

                </div>

                {/* Status Indicators & Metadata flat CLI style */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', padding: '0 4px', fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>
                  <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  {isMe && (
                    <span>
                      {msg.status === 'sent' && '[sent]'}
                      {msg.status === 'delivered' && '[delivered]'}
                      {msg.status === 'read' && (
                        <span style={{ color: 'var(--color-primary)' }}>[read]</span>
                      )}
                      {msg.burnType && msg.burnType !== 'timer' && ` [burn: ${msg.burnType}]`}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {isRecipientTyping && (
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', paddingLeft: '4px', fontFamily: 'monospace' }}>
            <span>* {recipient.toLowerCase()} is writing to /dev/tty1...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Terminal Input Form */}
      <div 
        className="glass-panel" 
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-color)',
          borderLeft: 0,
          borderRight: 0,
          borderBottom: 0,
          borderRadius: 0,
          background: 'var(--bg-panel)'
        }}
      >
        {!sharedKey ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '4px', color: 'var(--color-accent)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
            <span>[Access Denied] Please load crypt_key before accessing terminal channel.</span>
          </div>
        ) : showRecorder ? (
          <AudioRecorder
            sharedKey={sharedKey}
            onSendAudio={handleSendAudio}
            onCancel={() => setShowRecorder(false)}
          />
        ) : (
          <form onSubmit={handleSend} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            
            {/* Attachment Button with EXIF Scrubbing */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {(!isAdmin && ringLevel > 1) ? (
              <button
                type="button"
                className="neon-button ghost disabled"
                onClick={() => alert("🔒 [ACCESS DENIED] File transfers are restricted strictly to Ring 1 (kernel) clearance and above.")}
                style={{ padding: isMobile ? '6px 10px' : '6px 12px', flexShrink: 0, height: '36px', fontSize: '0.75rem', color: '#666', border: '1px solid #333', cursor: 'not-allowed' }}
                title="🔒 Requires Ring 1 Clearance"
              >
                <span>{isMobile ? '[🔒]' : '[🔒 ATTACH]'}</span>
              </button>
            ) : (
              <button
                type="button"
                className="neon-button ghost"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: isMobile ? '6px 10px' : '6px 12px', flexShrink: 0, height: '36px', fontSize: '0.75rem' }}
                title="Upload E2EE metadata-scrubbed padded attachment"
              >
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <span>{isMobile ? '[+]' : '[ATTACH]'}</span>}
              </button>
            )}

            {/* Ephemeral Voice Note Record Trigger Button */}
            {(!isAdmin && ringLevel > 1) ? (
              <button
                type="button"
                className="neon-button ghost disabled"
                onClick={() => alert("🔒 [ACCESS DENIED] Voice memos are restricted strictly to Ring 1 (kernel) clearance and above.")}
                style={{ padding: isMobile ? '6px 10px' : '6px 12px', flexShrink: 0, height: '36px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#666', border: '1px solid #333', cursor: 'not-allowed' }}
                title="🔒 Requires Ring 1 Clearance"
              >
                <Mic size={13} style={{ flexShrink: 0, color: '#666' }} />
                {!isMobile && <span>[🔒 REC]</span>}
              </button>
            ) : (
              <button
                type="button"
                className="neon-button ghost"
                onClick={() => setShowRecorder(true)}
                style={{ padding: isMobile ? '6px 10px' : '6px 12px', flexShrink: 0, height: '36px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                title="Record encrypted voice memo"
              >
                <Mic size={13} style={{ flexShrink: 0 }} />
                {!isMobile && <span>[REC]</span>}
              </button>
            )}

            {/* EXCLUSIVE COMMAND LINE PROMPT STYLE FOR ADMINISTRATORS */}
            <span style={{ 
              fontSize: '0.8rem', 
              color: isAdmin ? 'var(--color-accent)' : 'var(--color-primary)', 
              fontFamily: 'monospace', 
              fontWeight: 'bold', 
              flexShrink: 0,
              textShadow: isAdmin ? '0 0 6px var(--color-accent)' : 'none'
            }}>
              {isMobile ? (isAdmin ? '#' : '$') : (isAdmin ? 'root@xtassy:~#' : `${sender.toLowerCase()}@xtassy:~$`)}
            </span>

            {/* Main Text Input */}
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type="text"
                className="neon-input"
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  onTypingStatus(true);
                  if (typingTimeout) clearTimeout(typingTimeout);
                  const timeout = setTimeout(() => onTypingStatus(false), 1500);
                  setTypingTimeout(timeout);
                }}
                placeholder={isAdmin ? "enter root executive CLI command..." : "Type secure E2EE message..."}
                style={{
                  width: '100%',
                  height: '36px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border-color)',
                  color: isAdmin ? 'var(--color-accent)' : 'var(--color-primary)',
                  borderRadius: 0,
                  padding: '6px 0',
                  outline: 'none'
                }}
              />
            </div>

            {/* Send Button */}
            <button
              type="submit"
              className="neon-button"
              disabled={!inputText.trim()}
              style={{ padding: '6px 16px', flexShrink: 0, height: '36px' }}
            >
              <Send size={14} />
            </button>
          </form>
        )}
      </div>

      <style>{`
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
