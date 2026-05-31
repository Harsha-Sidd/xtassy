import { useState, useEffect, useCallback } from 'react';
import { Dashboard } from './components/Dashboard';
import { KeySetup } from './components/KeySetup';
import { ChatWindow } from './components/ChatWindow';
import { AdminConsole } from './components/AdminConsole';
import { Key } from 'lucide-react';
import { ThemeProvider } from './components/ThemeContext';
import { solveClearanceChallenge, checkPassphraseEntropy } from './crypto';

interface Contact {
  username: string;
  online: boolean;
  unreadCount: number;
}

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
  isBurning?: boolean;
}

const getBackendUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const paramUrl = params.get('backend') || params.get('b');
  if (paramUrl) {
    localStorage.setItem('xtassy_backend_url', paramUrl);
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
    return paramUrl;
  }
  const storedUrl = localStorage.getItem('xtassy_backend_url');
  if (storedUrl) return storedUrl;

  // Auto-detect local development environment to target backend port 5000 automatically
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  }

  return import.meta.env.VITE_BACKEND_URL || window.location.origin;
};

const BACKEND_URL = getBackendUrl();

function AppContent() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [onlineUsersLevels, setOnlineUsersLevels] = useState<{ [username: string]: number }>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sharedKeys, setSharedKeys] = useState<{ [recipient: string]: string }>({});
  
  const [isRecipientTyping, setIsRecipientTyping] = useState(false);
  
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Admin States
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [showAdminConsole, setShowAdminConsole] = useState(false);

  // Clearance Privilege System States
  const [msgCount, setMsgCount] = useState<number>(() => Number(localStorage.getItem('xtassy_msg_count') || '0'));
  const [bytesSent, setBytesSent] = useState<number>(() => Number(localStorage.getItem('xtassy_bytes_sent') || '0'));
  const [rotations, setRotations] = useState<number>(() => Number(localStorage.getItem('xtassy_rotations') || '0'));
  const [highEntropyRotations, setHighEntropyRotations] = useState<number>(() => Number(localStorage.getItem('xtassy_high_entropy_rotations') || '0'));
  const [uptime, setUptime] = useState<number>(() => Number(localStorage.getItem('xtassy_uptime') || '0'));
  const [ringLevel, setRingLevel] = useState<number>(() => Number(localStorage.getItem('xtassy_ring_level') || '3'));
  
  // Mining state for CPU Proof-of-Work challenge
  const [miningTargetRing, setMiningTargetRing] = useState<number | null>(null);
  const [miningLog, setMiningLog] = useState<string[]>([]);
  const [miningProgress, setMiningProgress] = useState<number>(0);
  const [currentMiningState, setCurrentMiningState] = useState<{ nonce: number; hash: string } | null>(null);

  const startClearanceUpgrade = async (targetRing: number) => {
    setMiningTargetRing(targetRing);
    setMiningProgress(0);
    setMiningLog([
      `[sys_privilege]: Initiating clearance compiling sequence for target Ring ${targetRing}...`,
      `[sys_privilege]: User presence: ${currentUser}`,
      `[sys_privilege]: Hashing block puzzle target: ${currentUser?.toLowerCase()}_ring${targetRing}_<nonce>`,
      `[sys_privilege]: Hashing engine engaged. Enforcing Hashcash CPU Proof-of-Work...`,
      `[sys_privilege]: Hashing difficulty: ${targetRing === 2 ? '4 leading zeros (operator clearance)' : targetRing === 1 ? '5 leading zeros (kernel clearance)' : '6 leading zeros (sysop clearance)'}`
    ]);

    const difficulty = targetRing === 2 ? 4 : targetRing === 1 ? 5 : 6;

    try {
      const result = await solveClearanceChallenge(
        currentUser || 'guest',
        targetRing,
        difficulty,
        (nonce, hash) => {
          setCurrentMiningState({ nonce, hash });
          setMiningLog((prev) => {
            const next = [...prev, `[mining_engine]: nonce: ${nonce} | hash: ${hash.substring(0, 32)}... [REJECTED]`];
            if (next.length > 25) {
              return [next[0], next[1], next[2], next[3], next[4], ...next.slice(next.length - 18)];
            }
            return next;
          });
          const avgNonces = difficulty === 4 ? 65536 : difficulty === 5 ? 1048576 : 16777216;
          const prog = Math.min(99, Math.floor((nonce / avgNonces) * 100));
          setMiningProgress(prog);
        }
      );

      // Solved successfully!
      setMiningProgress(100);
      setCurrentMiningState(null);
      setMiningLog((prev) => [
        ...prev,
        `\n[sys_privilege] *** PROOF-OF-WORK BLOCK SOLVED SUCCESSFULLY ***`,
        `[sys_privilege] Nonce solved: ${result.nonce}`,
        `[sys_privilege] Valid hash: ${result.hash}`,
        `[sys_privilege] Compile duration: ${(result.duration / 1000).toFixed(2)}s`,
        `\n[sys_kernel] EXEC PRIVILEGE ESCALATION: Ring ${ringLevel} ──> Ring ${targetRing}`,
        `[sys_kernel] Installing security clearance ring driver...`,
        `[sys_kernel] [========================================] 100%`,
        `[sys_kernel] Syncing credentials to active memory maps...`,
        `[sys_kernel] CLEARANCE LEVEL UPGRADE COMPILE COMPLETE.`
      ]);

      setTimeout(() => {
        setRingLevel(targetRing);
        localStorage.setItem('xtassy_ring_level', String(targetRing));
        setMiningTargetRing(null);
      }, 3000);

    } catch (err) {
      console.error(err);
      setMiningTargetRing(null);
      alert('Clearance compiling interrupted or failed.');
    }
  };

  const handleElevateAdmin = (token: string) => {
    setIsAdmin(true);
    setAdminToken(token);
    setCurrentUser('root');
    localStorage.setItem('xtassy_username', 'root');
    localStorage.setItem('xtassy_admin_token', token);
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleAddContact = useCallback((contactName: string) => {
    setContacts((prev) => {
      const exists = prev.some(c => c.username.toLowerCase() === contactName.toLowerCase());
      if (exists) return prev;
      return [...prev, { username: contactName, online: false, unreadCount: 0 }];
    });
  }, []);

  // HTTP Polling Loop
  useEffect(() => {
    if (!currentUser) return;

    let active = true;

    const doPoll = async () => {
      try {
        const start = Date.now();
        const response = await fetch(`${BACKEND_URL}/api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'poll', username: currentUser, ringLevel })
        });
        if (!response.ok) return;

        const data = await response.json();
        if (!active) return;

        // Check if session was evicted by administrator
        if (data.success === false && data.error === 'SESSION_EVICTED') {
          alert(`[ALERT] ${data.reason}`);
          handleLogout();
          return;
        }

        // Increment local active session uptime metrics
        setUptime((prev) => {
          const next = prev + 2;
          localStorage.setItem('xtassy_uptime', String(next));
          return next;
        });

        setLatency(Date.now() - start);

        if (data.onlineUsers) {
          const cleanUsers = data.onlineUsers.map((u: any) => u.username.toLowerCase());
          setOnlineUsers(cleanUsers);

          const levelsMap: { [username: string]: number } = {};
          data.onlineUsers.forEach((u: any) => {
            levelsMap[u.username.toLowerCase()] = u.ringLevel || 3;
          });
          setOnlineUsersLevels(levelsMap);

          setContacts((prev) =>
            prev.map(c => ({
              ...c,
              online: cleanUsers.includes(c.username.toLowerCase())
            }))
          );
        }

        if (data.typing) {
          setIsRecipientTyping(!!(selectedContact && data.typing[selectedContact.toLowerCase()]));
        } else {
          setIsRecipientTyping(false);
        }

        if (data.messages) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map(m => m.id));
            
            // Auto add new message senders to contacts (only for direct 1-to-1 ciphers)
            data.messages.forEach((msg: Message) => {
              if (msg.sender.toLowerCase() !== currentUser.toLowerCase()) {
                if (!msg.recipient.startsWith('#')) {
                  handleAddContact(msg.sender);
                }
              }
            });

            const newMsgs = data.messages.filter((m: Message) => !existingIds.has(m.id));

            newMsgs.forEach((msg: Message) => {
              const isGroup = msg.recipient.startsWith('#');
              const target = isGroup ? msg.recipient : msg.sender;
              const isFocused = isGroup
                ? selectedContact?.toLowerCase() === msg.recipient.toLowerCase()
                : selectedContact?.toLowerCase() === msg.sender.toLowerCase();

              if (!isFocused) {
                setContacts((prevContacts) =>
                  prevContacts.map((c) =>
                    c.username.toLowerCase() === target.toLowerCase()
                      ? { ...c, unreadCount: c.unreadCount + 1 }
                      : c
                  )
                );
              }
            });

            const updated = prev.map((oldMsg) => {
              const latest = data.messages.find((m: Message) => m.id === oldMsg.id);
              if (latest) {
                return {
                  ...oldMsg,
                  status: latest.status,
                  readAt: latest.readAt,
                  burnTime: latest.burnTime,
                  reactions: latest.reactions
                };
              }
              return oldMsg;
            });

            const remaining = [...updated, ...newMsgs].filter((msg) =>
              data.messages.some((m: Message) => m.id === msg.id)
            );

            return remaining;
          });
        }

      } catch (err) {
        console.error('API polling connection error:', err);
      }
    };

    doPoll();
    const interval = setInterval(doPoll, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [currentUser, selectedContact, ringLevel, handleAddContact]);

  // Initialize and check local storage on startup
  useEffect(() => {
    const storedUser = localStorage.getItem('xtassy_username');
    const storedKeys = localStorage.getItem('xtassy_keys');
    const storedAdminToken = localStorage.getItem('xtassy_admin_token');
    
    if (storedKeys) {
      setSharedKeys(JSON.parse(storedKeys));
    }

    if (storedAdminToken && storedUser === 'root') {
      setIsAdmin(true);
      setAdminToken(storedAdminToken);
      setCurrentUser('root');
      return;
    }

    if (storedUser) {
      const autoLogin = async () => {
        try {
          const response = await fetch(`${BACKEND_URL}/api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'register', username: storedUser })
          });
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              setCurrentUser(data.username);
            } else {
              localStorage.removeItem('xtassy_username');
            }
          }
        } catch (err) {
          console.error('Auto login check failed:', err);
        }
      };
      autoLogin();
    }
  }, []);

  // Parse URL hash parameters
  useEffect(() => {
    if (!currentUser) return;

    const parseHash = () => {
      const hash = window.location.hash;
      if (hash && hash.startsWith('#')) {
        const params = new URLSearchParams(hash.slice(1));
        const key = params.get('key');
        const joinUser = params.get('join');

        if (joinUser && key) {
          handleAddContact(joinUser);
          
          setSharedKeys((prev) => {
            const updated = { ...prev, [joinUser.toLowerCase()]: key };
            localStorage.setItem('xtassy_keys', JSON.stringify(updated));
            return updated;
          });

          setSelectedContact(joinUser);
          setShowKeySetup(false);
          
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    };

    parseHash();
    window.addEventListener('hashchange', parseHash);
    return () => window.removeEventListener('hashchange', parseHash);
  }, [currentUser, handleAddContact]);

  // Action: Register User / Admin login
  const handleRegister = async (username: string) => {
    setRegistrationError(null);

    // Check if user is logging in as Admin
    if (username.trim().toLowerCase().startsWith('/admin ')) {
      const token = username.replace(/^\/admin\s+/i, '').trim();
      try {
        const response = await fetch(`${BACKEND_URL}/api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'admin_login', token })
        });
        
        if (!response.ok) {
          throw new Error('Admin authentication rejected.');
        }

        const data = await response.json();
        if (data.success) {
          setIsAdmin(true);
          setAdminToken(data.adminToken);
          setCurrentUser('root');
          localStorage.setItem('xtassy_username', 'root');
          localStorage.setItem('xtassy_admin_token', data.adminToken);
        } else {
          setRegistrationError(data.error || 'Failed to authenticate admin session.');
        }
      } catch (err: any) {
        setRegistrationError(err.message || 'Failed to verify administrative credentials.');
      }
      return;
    }

    // Standard User Registration
    try {
      const response = await fetch(`${BACKEND_URL}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', username })
      });
      if (!response.ok) throw new Error('Server connection refused');
      const data = await response.json();
      if (data.success) {
        setCurrentUser(data.username);
        localStorage.setItem('xtassy_username', data.username);
      } else {
        setRegistrationError(data.error || 'Server rejected registration');
      }
    } catch (err: any) {
      setRegistrationError(err.message || 'Failed to establish cryptographic session.');
    }
  };

  // Action: Logout / Disconnect
  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedContact(null);
    setMessages([]);
    setIsAdmin(false);
    setAdminToken(null);
    setShowAdminConsole(false);
    localStorage.removeItem('xtassy_username');
    localStorage.removeItem('xtassy_admin_token');
  };

  const handleSelectContact = (contactName: string) => {
    setSelectedContact(contactName);
    setShowKeySetup(false);
    setShowAdminConsole(false);

    setContacts((prev) =>
      prev.map((c) =>
        c.username.toLowerCase() === contactName.toLowerCase()
          ? { ...c, unreadCount: 0 }
          : c
      )
    );

    messages.forEach((msg) => {
      if (msg.sender.toLowerCase() === contactName.toLowerCase() && msg.status !== 'read') {
        handleMarkRead(msg.id);
      }
    });
  };

  const handleSetKey = (key: string) => {
    if (!selectedContact) return;
    const cleanContact = selectedContact.toLowerCase();
    
    setSharedKeys((prev) => {
      const updated = { ...prev, [cleanContact]: key };
      localStorage.setItem('xtassy_keys', JSON.stringify(updated));
      return updated;
    });

    // Check E2EE key rotation passphrase entropy
    const { score } = checkPassphraseEntropy(key);

    // Increment E2EE key rotation metrics
    setRotations((prev) => {
      const next = prev + 1;
      localStorage.setItem('xtassy_rotations', String(next));
      return next;
    });

    if (score >= 5) {
      setHighEntropyRotations((prev) => {
        const next = prev + 1;
        localStorage.setItem('xtassy_high_entropy_rotations', String(next));
        return next;
      });
    }

    setShowKeySetup(false);
  };

  const handleSendMessage = async (msgPayload: any) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_message',
          username: currentUser,
          sender: currentUser,
          ...msgPayload
        })
      });
      if (!response.ok) throw new Error('Send failed');
      const data = await response.json();
      if (data.success) {
        setMessages((prev) => [...prev, data.message]);
        
        // Update user clearance activity metrics
        setMsgCount((prev) => {
          const next = prev + 1;
          localStorage.setItem('xtassy_msg_count', String(next));
          return next;
        });

        const transmittedSize = Number(msgPayload.payloadBytes || msgPayload.ciphertext.length);
        setBytesSent((prev) => {
          const next = prev + transmittedSize;
          localStorage.setItem('xtassy_bytes_sent', String(next));
          return next;
        });

      } else {
        alert(`Failed to send: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to transmit E2EE payload.');
    }
  };

  const handleMarkRead = async (messageId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', messageId })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setMessages((prev) =>
            prev.map((msg) => msg.id === messageId ? data.message : msg)
          );
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBurnMessage = async (messageId: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'burn_message', messageId })
      });
      if (response.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTypingStatus = async (isTyping: boolean) => {
    if (!selectedContact || !currentUser) return;
    try {
      await fetch(`${BACKEND_URL}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'typing_status', sender: currentUser, recipient: selectedContact, isTyping })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleReactMessage = async (messageId: string, emoji: string) => {
    if (!currentUser) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'react_message', messageId, username: currentUser, emoji })
      });
      if (response.ok) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === messageId) {
              const reactions = { ...msg.reactions, [currentUser]: emoji };
              return { ...msg, reactions };
            }
            return msg;
          })
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePanicNuke = async () => {
    try {
      await fetch(`${BACKEND_URL}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'panic_nuke' })
      });
    } catch (err) {
      console.error(err);
    }
    
    setCurrentUser(null);
    setSelectedContact(null);
    setMessages([]);
    setSharedKeys({});
    localStorage.clear();
    window.location.reload();
  };

  const activeSharedKey = selectedContact ? sharedKeys[selectedContact.toLowerCase()] || '' : '';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {!currentUser ? (
        <Dashboard
          currentUser={currentUser}
          onlineUsers={onlineUsers}
          contacts={contacts}
          onRegister={handleRegister}
          onAddContact={handleAddContact}
          onSelectContact={handleSelectContact}
          onLogout={handleLogout}
          selectedContact={selectedContact}
          registrationError={registrationError}
          latency={latency}
          onPanicNuke={handlePanicNuke}
          msgCount={msgCount}
          bytesSent={bytesSent}
          rotations={rotations}
          highEntropyRotations={highEntropyRotations}
          uptime={uptime}
          ringLevel={ringLevel}
          onStartClearanceUpgrade={startClearanceUpgrade}
          onlineUsersLevels={onlineUsersLevels}
        />
      ) : (
        <div style={{ display: 'flex', flex: 1, height: '100vh', overflow: 'hidden' }}>
          
          {(!isMobile || (!selectedContact && !showAdminConsole)) && (
            <div style={{ width: isMobile ? '100%' : '320px', borderRight: isMobile ? 'none' : '1px solid var(--border-color)', background: 'rgba(6, 7, 11, 0.4)', flexShrink: 0, height: '100%' }}>
              <Dashboard
                currentUser={currentUser}
                onlineUsers={onlineUsers}
                contacts={contacts}
                onRegister={handleRegister}
                onAddContact={handleAddContact}
                onSelectContact={handleSelectContact}
                onLogout={handleLogout}
                selectedContact={selectedContact}
                registrationError={registrationError}
                latency={latency}
                onPanicNuke={handlePanicNuke}
                isAdmin={isAdmin}
                showAdminConsole={showAdminConsole}
                onToggleAdminConsole={() => setShowAdminConsole(!showAdminConsole)}
                msgCount={msgCount}
                bytesSent={bytesSent}
                rotations={rotations}
                highEntropyRotations={highEntropyRotations}
                uptime={uptime}
                ringLevel={ringLevel}
                onStartClearanceUpgrade={startClearanceUpgrade}
                onlineUsersLevels={onlineUsersLevels}
              />
            </div>
          )}

          {(!isMobile || selectedContact || showAdminConsole) && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(0, 0, 0, 0.15)', overflow: 'hidden', height: '100%' }}>
              
              {showAdminConsole && adminToken ? (
                /* Secure Admin Htop Console Overlay */
                <AdminConsole 
                  adminToken={adminToken} 
                  backendUrl={BACKEND_URL} 
                  onBack={() => setShowAdminConsole(false)} 
                />
              ) : miningTargetRing !== null ? (
                /* SECURE PRIVILEGE COMPILER MINING OVERLAY */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto', fontFamily: 'monospace', background: '#020502' }}>
                  <div className="glass-panel" style={{ padding: '20px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '4px', maxWidth: '780px', margin: 'auto', width: '100%' }}>
                    <div className="terminal-window-header" style={{ margin: '-20px -20px 16px -20px' }}>
                      <span>usr@xtassy-compiler:~ // compile --clearance ring-{miningTargetRing}</span>
                      <div className="terminal-window-buttons">
                        <div className="terminal-window-button minimize"></div>
                        <div className="terminal-window-button maximize"></div>
                        <div className="terminal-window-button close"></div>
                      </div>
                    </div>

                    <div style={{ color: 'var(--color-primary)', fontSize: '0.85rem', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                      ⚡ [XTASSY CORE SECURITY SERVICE] engaged...
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                        <span>Compiling ring-{miningTargetRing} clearance drivers...</span>
                        <span>{miningProgress}%</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${miningProgress}%`, height: '100%', background: 'var(--color-primary)', boxShadow: '0 0 8px var(--color-primary)', transition: 'width 0.2s' }}></div>
                      </div>
                    </div>

                    {/* Current Miner State details */}
                    {currentMiningState && (
                      <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '2px', border: '1px dashed var(--border-color)', fontSize: '0.7rem', color: 'var(--color-secondary)', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                        <div><strong>Current Target</strong>: {currentUser?.toLowerCase()}_ring{miningTargetRing}_&lt;nonce&gt;</div>
                        <div><strong>Active Nonce</strong>: {currentMiningState.nonce}</div>
                        <div><strong>SHA-256 Hash</strong>: {currentMiningState.hash}</div>
                      </div>
                    )}

                    {/* Scrolling compilation syslog */}
                    <div style={{ height: '220px', overflowY: 'auto', background: '#000000', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '2px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                      {miningLog.map((line, idx) => (
                        <div key={idx} style={{ whiteSpace: 'pre-wrap', color: line.includes('SUCCESS') || line.includes('COMPLETE') ? 'var(--color-success)' : line.includes('ERROR') ? 'var(--color-accent)' : 'inherit' }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : !selectedContact ? (
                /* Empty State Welcome Board styled like Neofetch */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isMobile ? '16px' : '40px', overflowY: 'auto', fontFamily: 'monospace' }}>
                  <div className="glass-panel" style={{ padding: isMobile ? '16px' : '30px', background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '4px', maxWidth: '780px', margin: 'auto', width: '100%' }}>
                    
                    <div className="terminal-window-header" style={{ margin: isMobile ? '-16px -16px 16px -16px' : '-30px -30px 24px -30px' }}>
                      <span>{isAdmin ? 'root@xtassy-node:~ // neofetch --root' : 'guest@xtassy-node:~ // neofetch --secure'}</span>
                      <div className="terminal-window-buttons">
                        <div className="terminal-window-button minimize"></div>
                        <div className="terminal-window-button maximize"></div>
                        <div className="terminal-window-button close"></div>
                      </div>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '1.2fr 2fr',
                      gap: isMobile ? '20px' : '30px',
                      alignItems: 'center',
                      textAlign: isMobile ? 'center' : 'left'
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                      <pre style={{
                        color: isAdmin ? 'var(--color-accent)' : 'var(--color-primary)',
                        fontSize: '0.65rem',
                        lineHeight: '1.25',
                        fontFamily: 'monospace',
                        whiteSpace: 'pre',
                        margin: 0
                      }}>
{`       .-----.
      /  _ _  \\
     |  /   \\  |
     |  |   |  |
    .---|---|---.
   /====|===|====\\
  |  [ E 2 E E ]  |
  |   .-------.   |
  |   |  [O]  |   |
  |   '-------'   |
   \\_____________/`}
                      </pre>
                    </div>

                    <div style={{ fontSize: '0.8rem', lineHeight: '1.6', fontFamily: 'monospace' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: isAdmin ? 'var(--color-accent)' : 'var(--color-primary)', marginBottom: '8px' }}>
                        {currentUser?.toLowerCase()}@xtassy-node
                      </div>
                      <div style={{ borderBottom: '1px solid var(--border-color)', marginBottom: '8px', paddingBottom: '4px' }}>
                        -----------------------
                      </div>
                      <div><strong style={{ color: 'var(--color-secondary)' }}>OS</strong>: Xtassy Linux Terminal Core v3.0.0</div>
                      <div><strong style={{ color: 'var(--color-secondary)' }}>Kernel</strong>: PBKDF2-AES-GCM-256-E2EE</div>
                      <div><strong style={{ color: 'var(--color-secondary)' }}>Session</strong>: HTTPS Polling ({BACKEND_URL.replace(/^https?:\/\//, '')})</div>
                      <div><strong style={{ color: 'var(--color-secondary)' }}>Uptime</strong>: Real-time presence linked</div>
                      <div><strong style={{ color: 'var(--color-secondary)' }}>Memory</strong>: Zero Disk Footprint (100% Ephemeral)</div>
                      <div><strong style={{ color: 'var(--color-secondary)' }}>Shell</strong>: {isAdmin ? 'Root CLI Executive Shell' : 'E2EE Secure Messaging Terminal'}</div>
                      <div><strong style={{ color: 'var(--color-secondary)' }}>Terminal</strong>: dev/rooms ({contacts.length} channels loaded)</div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px dashed var(--border-color)', marginTop: '24px', paddingTop: '20px' }}>
                    <div style={{ color: 'var(--color-primary)', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Secure Channel Policy
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                      1. All text and files are encrypted client-side locally in your browser prior to networking.
                      <br />
                      2. Private passphrases (keys) are never transmitted to the host server in plain-text.
                      <br />
                      3. Self-destruct countdown values are fully enforced client-side and server-side concurrently.
                      <br />
                      4. Selecting any room in the sidebar cd-mounts that dev room and locks in E2EE ciphers.
                    </p>
                  </div>

                  <div style={{ borderTop: '1px dashed var(--border-color)', marginTop: '20px', paddingTop: '16px' }}>
                    <div style={{ color: 'var(--color-primary)', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      System Instructions & Help
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div>• <strong>Connect to a Chat</strong>: Use the <span style={{ color: 'var(--color-primary)' }}>$ Chats</span> panel to add a contact by username. Select the contact to open a secure channel.</div>
                      <div>• <strong>Join a Group</strong>: Use the <span style={{ color: 'var(--color-primary)' }}>$ Groups</span> panel to connect to a multi-party E2EE room (prefixed with <span style={{ color: 'var(--color-primary)' }}>#</span>).</div>
                      {isAdmin ? (
                        <div style={{ color: 'var(--color-accent)' }}>• <strong>System Console</strong>: Click the glowing <strong>[sys_admin]</strong> button in the sidebar to open the retro live htop resource and session monitor.</div>
                      ) : (
                        <div>• <strong>Admin Override</strong>: Log out and enter <code>/admin &lt;token&gt;</code> as your handle to authenticate root console credentials.</div>
                      )}
                      <div>• <strong>Panic Nuke Purge</strong>: Click the red <span style={{ color: 'var(--color-accent)', textShadow: '0 0 6px var(--color-accent)' }}>[PANIC]</span> button to instantly wipe active session databases, memory buffers, and files completely from both sides.</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Chat Room Active */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                
                <div 
                  className="glass-panel" 
                  style={{ 
                    padding: '8px 16px', 
                    borderRadius: 0, 
                    borderTop: 0, 
                    borderLeft: 0, 
                    borderRight: 0, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    background: 'rgba(13, 15, 27, 0.4)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Secure Room:</span>
                    <strong style={{ fontSize: '0.8rem', color: 'var(--color-primary)' }}>{selectedContact}</strong>
                  </div>

                  <button
                    onClick={() => setShowKeySetup(!showKeySetup)}
                    className={`neon-button ${activeSharedKey ? 'ghost' : 'secondary'}`}
                    style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Key size={12} />
                    <span>{activeSharedKey ? 'Lock / Share Key' : '⚠️ Unlock Chat'}</span>
                  </button>
                </div>

                {(!activeSharedKey || showKeySetup) ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
                    <KeySetup
                      recipient={selectedContact}
                      sender={currentUser}
                      currentKey={activeSharedKey}
                      onSetKey={handleSetKey}
                    />
                  </div>
                ) : (
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <ChatWindow
                      recipient={selectedContact}
                      sender={currentUser}
                      sharedKey={activeSharedKey}
                      messages={messages.filter((m) => {
                        const isGroup = selectedContact.startsWith('#');
                        if (isGroup) {
                          return m.recipient.toLowerCase() === selectedContact.toLowerCase();
                        }
                        return (
                          (m.sender.toLowerCase() === currentUser.toLowerCase() &&
                            m.recipient.toLowerCase() === selectedContact.toLowerCase()) ||
                          (m.sender.toLowerCase() === selectedContact.toLowerCase() &&
                            m.recipient.toLowerCase() === currentUser.toLowerCase())
                        );
                      })}
                      isRecipientTyping={isRecipientTyping}
                      onSendMessage={handleSendMessage}
                      onMarkRead={handleMarkRead}
                      onBurnMessage={handleBurnMessage}
                      onTypingStatus={handleTypingStatus}
                      onSetKey={handleSetKey}
                      onReactMessage={handleReactMessage}
                      onPanicNuke={handlePanicNuke}
                      latency={latency}
                      onBack={isMobile ? () => setSelectedContact(null) : undefined}
                      isMobile={isMobile}
                      isAdmin={isAdmin}
                      adminToken={adminToken}
                      backendUrl={BACKEND_URL}
                      ringLevel={ringLevel}
                      onElevateAdmin={handleElevateAdmin}
                      onlineUsersLevels={onlineUsersLevels}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
