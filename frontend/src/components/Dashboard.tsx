import React, { useState } from 'react';
import { User, UserPlus, Users, ShieldAlert, LogOut, Radio, Terminal, Shield } from 'lucide-react';
import { useTheme } from './ThemeContext';

interface Contact {
  username: string;
  online: boolean;
  unreadCount: number;
}

interface DashboardProps {
  currentUser: string | null;
  onlineUsers: string[];
  contacts: Contact[];
  onRegister: (username: string) => void;
  onAddContact: (username: string) => void;
  onSelectContact: (username: string) => void;
  onLogout: () => void;
  selectedContact: string | null;
  registrationError: string | null;
  latency?: number | null;
  onPanicNuke?: () => void;
  isAdmin?: boolean;
  onToggleAdminConsole?: () => void;
  showAdminConsole?: boolean;
  // Privilege stats props
  msgCount?: number;
  bytesSent?: number;
  rotations?: number;
  highEntropyRotations?: number;
  uptime?: number;
  ringLevel?: number;
  onStartClearanceUpgrade?: (targetRing: number) => void;
  onlineUsersLevels?: { [username: string]: number };
}

export const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  onlineUsers,
  contacts,
  onRegister,
  onAddContact,
  onSelectContact,
  onLogout,
  selectedContact,
  registrationError,
  latency,
  onPanicNuke,
  isAdmin = false,
  onToggleAdminConsole,
  showAdminConsole = false,
  msgCount = 0,
  bytesSent = 0,
  rotations: _rotations = 0,
  highEntropyRotations = 0,
  uptime = 0,
  ringLevel = 3,
  onStartClearanceUpgrade,
  onlineUsersLevels = {}
}) => {
  const [usernameInput, setUsernameInput] = useState('');
  const [newContactInput, setNewContactInput] = useState('');
  const [contactError, setContactError] = useState<string | null>(null);
  const [newGroupInput, setNewGroupInput] = useState('');
  const [groupError, setGroupError] = useState<string | null>(null);
  const [showEscalationDetails, setShowEscalationDetails] = useState(false);
  const { theme, setTheme } = useTheme();

  const getRequirements = (level: number) => {
    if (level === 3) {
      return {
        target: 'Ring 2 (operator)',
        msgs: 50,
        rotations: 2,
        bytes: 100 * 1024,
        uptime: 300,
        difficulty: '4 leading zeros (Hashcash PoW)'
      };
    }
    if (level === 2) {
      return {
        target: 'Ring 1 (kernel)',
        msgs: 150,
        rotations: 5,
        bytes: 2 * 1024 * 1024,
        uptime: 1200,
        difficulty: '5 leading zeros (Intense PoW)'
      };
    }
    if (level === 1) {
      return {
        target: 'Ring 0 (sysop)',
        msgs: 300,
        rotations: 10,
        bytes: 10 * 1024 * 1024,
        uptime: 3600,
        difficulty: '6 leading zeros (Ultimate Cryptographic Hashing)'
      };
    }
    return null;
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = usernameInput.trim();
    if (!val) return;

    if (val.toLowerCase().startsWith('backend ')) {
      const url = val.substring(8).trim();
      localStorage.setItem('xtassy_backend_url', url);
      alert(`[SYSTEM] Backend target relocated to: ${url}\nPage reloading...`);
      window.location.reload();
      return;
    }

    onRegister(val);
  };

  const handleAddContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const contact = newContactInput.trim();
    if (!contact) return;
    
    if (contact.toLowerCase() === currentUser?.toLowerCase()) {
      setContactError("Error: Cannot add yourself.");
      return;
    }

    if (contacts.some(c => c.username.toLowerCase() === contact.toLowerCase())) {
      setContactError("Error: Channel already active.");
      return;
    }

    onAddContact(contact);
    setNewContactInput('');
    setContactError(null);
  };

  const handleAddGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let group = newGroupInput.trim();
    if (!group) return;

    if (!group.startsWith('#')) {
      group = '#' + group;
    }

    if (contacts.some(c => c.username.toLowerCase() === group.toLowerCase())) {
      setGroupError("Error: Group room already active.");
      return;
    }

    onAddContact(group);
    setNewGroupInput('');
    setGroupError(null);
  };

  // If not logged in, show Linux Command Line shell login screen
  if (!currentUser) {
    return (
      <div 
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '20px'
        }}
      >
        <div 
          className="glass-panel fade-in" 
          style={{
            width: '100%',
            maxWidth: '520px',
            background: 'var(--bg-panel)',
            padding: 0,
            overflow: 'hidden'
          }}
        >
          {/* Linux window title bar */}
          <div className="terminal-window-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Terminal size={12} />
              <span>guest@xtassy-node:~</span>
            </span>
            <div className="terminal-window-buttons">
              <div className="terminal-window-button minimize" />
              <div className="terminal-window-button maximize" />
              <div className="terminal-window-button close" />
            </div>
          </div>

          <div style={{ padding: '30px 24px' }}>
            {/* Retro Monospace ASCII Logo */}
            <pre style={{
              fontSize: '0.75rem',
              lineHeight: '1.2',
              color: 'var(--color-primary)',
              textAlign: 'center',
              background: 'rgba(0,0,0,0.3)',
              padding: '16px 8px',
              borderRadius: '2px',
              border: '1px dashed var(--border-color)',
              marginBottom: '20px',
              fontFamily: 'monospace',
              whiteSpace: 'pre',
              overflowX: 'auto'
            }}>
{` _  _ ___ ____ ____ ____ _   _ 
  \\/   |  |__| [__  [__   \\_/  
 _/\\_  |  |  | ___] ___]   |   
                               
[SECURE EPHEMERAL COMMUNICATION SYSTEM]`}
            </pre>

            {/* Linux Simulated Bootup Logs */}
            <div style={{
              textAlign: 'left',
              fontSize: '0.7rem',
              color: 'var(--color-text-secondary)',
              fontFamily: 'monospace',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px'
            }}>
              <div>[  <span style={{ color: 'var(--color-primary)' }}>OK</span>  ] Engaged PBKDF2 key provider (SHA-256 / 100k rounds)</div>
              <div>[  <span style={{ color: 'var(--color-primary)' }}>OK</span>  ] Loaded AES-GCM-256 client cipher driver</div>
              <div>[  <span style={{ color: 'var(--color-primary)' }}>OK</span>  ] Bound secure presence socket to /dev/tty0</div>
              <div>[  <span style={{ color: 'var(--color-primary)' }}>OK</span>  ] Zero-Trace memory purger engaged successfully</div>
            </div>

            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ color: 'var(--color-primary)', fontSize: '0.85rem', marginBottom: '8px', fontFamily: 'monospace' }}>
                  xtassy-login login: 
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ color: 'var(--color-primary)', marginRight: '10px', fontWeight: 'bold' }}>$</span>
                  <input
                    type="text"
                    className="neon-input"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="enter handles... or /admin <token>"
                    maxLength={35}
                    style={{ background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', borderBottom: '1px solid var(--border-color)', color: 'var(--color-primary)', flex: 1, padding: '4px 0', outline: 'none' }}
                    required
                    autoFocus
                  />
                  <span className="terminal-cursor" />
                </div>
                {registrationError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-accent)', fontSize: '0.75rem', marginTop: '10px' }}>
                    <ShieldAlert size={12} />
                    <span>[Panic] {registrationError}</span>
                  </div>
                )}
              </div>

              <button type="submit" className="neon-button" style={{ marginTop: '10px' }}>
                ssh guest@xtassy-node
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Sidebar Layout for Active Conversations
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid var(--border-color)', overflow: 'hidden' }}>
      
      {/* Sidebar Terminal Title Bar */}
      <div className="terminal-window-header" style={{ fontSize: '0.62rem', flexShrink: 0 }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '8px' }}>
          {isAdmin ? 'root@xtassy-shell:~#' : `${currentUser.toLowerCase()}@xtassy-shell:~`}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <Radio size={10} style={{ color: 'var(--color-success)', animation: (typeof latency === 'number') ? `pulse-monochrome ${Math.max(0.5, (latency / 100))}s infinite alternate` : 'none' }} />
          <span>online {(typeof latency === 'number') ? `(${latency}ms)` : ''}</span>
        </span>
      </div>

      {/* Scrollable Main Sidebar Section */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '16px', gap: '16px', flex: 1, overflowY: 'auto' }}>
        
        {/* User Identity Flat Panel */}
        <div className="glass-panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isAdmin ? (
                <Shield size={14} style={{ color: 'var(--color-accent)' }} />
              ) : (
                <User size={14} style={{ color: 'var(--color-primary)' }} />
              )}
              <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: isAdmin ? 'var(--color-accent)' : 'inherit' }}>
                usr: {currentUser}
              </span>
            </div>
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {isAdmin && onToggleAdminConsole && (
                <button
                  onClick={onToggleAdminConsole}
                  style={{
                    border: '1px solid var(--color-accent)',
                    color: 'var(--color-accent)',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                    fontWeight: 'bold',
                    textShadow: '0 0 4px var(--color-accent)',
                    background: showAdminConsole ? 'rgba(255, 0, 79, 0.15)' : 'none'
                  }}
                  title="Toggle Admin System Console"
                >
                  [sys_admin]
                </button>
              )}

              {onPanicNuke && (
                <button 
                  onClick={onPanicNuke} 
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-accent)',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    fontWeight: 'bold',
                    textShadow: '0 0 6px var(--color-accent)'
                  }}
                  title="PANIC NUKE - PURGE STACKS"
                >
                  <span>[PANIC]</span>
                </button>
              )}
              
              <button 
                onClick={onLogout} 
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--color-accent)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--color-text-secondary)'}
                title="logout"
              >
                <LogOut size={12} />
                <span>[exit]</span>
              </button>
            </div>
          </div>

          {!isAdmin && (
            <div style={{ borderTop: '1px dashed var(--border-color)', marginTop: '8px', paddingTop: '8px', fontFamily: 'monospace' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>clearance:</span>
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 'bold',
                  padding: '1px 6px',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid',
                  borderRadius: '2px',
                  color: ringLevel === 0 ? '#00ff66' : ringLevel === 1 ? '#8be9fd' : ringLevel === 2 ? '#ffb000' : '#888888',
                  borderColor: ringLevel === 0 ? '#00ff66' : ringLevel === 1 ? '#8be9fd' : ringLevel === 2 ? '#ffb000' : '#888888',
                  textTransform: 'uppercase',
                  boxShadow: ringLevel === 0 ? '0 0 6px rgba(0, 255, 102, 0.2)' : 'none'
                }}>
                  {ringLevel === 0 ? 'Ring 0 (sysop)' : ringLevel === 1 ? 'Ring 1 (kernel)' : ringLevel === 2 ? 'Ring 2 (operator)' : 'Ring 3 (guest)'}
                </span>
              </div>

              {(() => {
                const req = getRequirements(ringLevel || 3);
                if (!req) {
                  return <div style={{ fontSize: '0.65rem', color: '#00ff66', textAlign: 'center', border: '1px dashed #00ff66', padding: '4px', background: 'rgba(0,255,102,0.05)', marginTop: '6px' }}>★ MAXIMUM CLEARANCE ★</div>;
                }

                // Calculate escalation progress
                const msgsRatio = Math.min(1, (msgCount || 0) / req.msgs);
                const rotationsRatio = Math.min(1, (highEntropyRotations || 0) / req.rotations);
                const bytesRatio = Math.min(1, (bytesSent || 0) / req.bytes);
                const uptimeRatio = Math.min(1, (uptime || 0) / req.uptime);
                const progressPercent = Math.floor(((msgsRatio + rotationsRatio + bytesRatio + uptimeRatio) / 4) * 100);

                const barWidth = 14;
                const filledChars = Math.round((progressPercent / 100) * barWidth);
                const emptyChars = barWidth - filledChars;
                const progressBarStr = `[${'='.repeat(Math.max(0, filledChars - 1))}>${' '.repeat(Math.max(0, emptyChars))}]`;

                const canUpgrade = (msgCount || 0) >= req.msgs && 
                  (highEntropyRotations || 0) >= req.rotations && 
                  (bytesSent || 0) >= req.bytes && 
                  (uptime || 0) >= req.uptime;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                    
                    {/* Compact Escalation progress row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem' }}>
                      <span style={{ color: 'var(--color-text-secondary)' }}>Escalation:</span>
                      <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>{progressPercent}%</span>
                    </div>

                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>
                      {progressBarStr}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                      <button
                        onClick={() => setShowEscalationDetails(!showEscalationDetails)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-secondary)',
                          cursor: 'pointer',
                          fontFamily: 'monospace',
                          fontSize: '0.6rem',
                          textDecoration: 'underline',
                          padding: 0,
                          outline: 'none',
                          textAlign: 'left'
                        }}
                      >
                        {showEscalationDetails ? '[hide details]' : '[check requirements]'}
                      </button>
                    </div>

                    {canUpgrade && (
                      <button 
                        onClick={() => onStartClearanceUpgrade && onStartClearanceUpgrade((ringLevel || 3) - 1)}
                        style={{
                          width: '100%',
                          fontSize: '0.7rem',
                          fontWeight: 'bold',
                          background: 'rgba(0, 255, 102, 0.15)',
                          border: '1px solid #00ff66',
                          color: '#00ff66',
                          textShadow: '0 0 4px #00ff66',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '2px',
                          marginTop: '6px'
                        }}
                      >
                        ⚡ [COMPILE KERNEL PRIVILEGES]
                      </button>
                    )}

                    {showEscalationDetails && (
                      <div style={{ borderTop: '1px dashed var(--border-color)', marginTop: '8px', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        
                        {/* Stats HUD */}
                        <div style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 6px', borderBottom: '1px dashed var(--border-color)', paddingBottom: '6px', marginBottom: '4px' }}>
                          <div>• msgs: {msgCount}</div>
                          <div>• rotations: {highEntropyRotations}</div>
                          <div>• data: {(bytesSent / 1024).toFixed(1)} KB</div>
                          <div>• uptime: {Math.floor(uptime / 60)}m {uptime % 60}s</div>
                        </div>

                        {/* Escalation details list */}
                        <div style={{ fontSize: '0.62rem', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ color: 'var(--color-primary)', fontWeight: 'bold', marginBottom: '2px' }}>escalation to {req.target}:</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>• msgs sent:</span>
                            <span style={{ color: (msgCount || 0) >= req.msgs ? '#00ff66' : 'inherit' }}>{msgCount}/{req.msgs}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>• E2EE rotations:</span>
                            <span style={{ color: (highEntropyRotations || 0) >= req.rotations ? '#00ff66' : 'inherit' }}>{highEntropyRotations}/{req.rotations}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>• padded bytes:</span>
                            <span style={{ color: (bytesSent || 0) >= req.bytes ? '#00ff66' : 'inherit' }}>{((bytesSent || 0)/1024).toFixed(0)}K/{(req.bytes/1024).toFixed(0)}K</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>• uptime threshold:</span>
                            <span style={{ color: (uptime || 0) >= req.uptime ? '#00ff66' : 'inherit' }}>{Math.floor((uptime || 0)/60)}m/{Math.floor(req.uptime/60)}m</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Hide other forms if admin console is open to declutter */}
        {!showAdminConsole && (
          <>
            {/* Add Contact (Connect Room) flat form */}
            <div className="glass-panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '8px', fontFamily: 'monospace' }}>
                $ Chats
              </div>
              <form onSubmit={handleAddContactSubmit} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="neon-input"
                  value={newContactInput}
                  onChange={(e) => setNewContactInput(e.target.value)}
                  placeholder="target_user..."
                  style={{ padding: '6px 10px', fontSize: '0.8rem', background: '#020502' }}
                  required
                />
                <button type="submit" className="neon-button" style={{ padding: '6px 12px' }} title="create channel">
                  <UserPlus size={14} />
                </button>
              </form>
              {contactError && (
                <div style={{ color: 'var(--color-accent)', fontSize: '0.7rem', marginTop: '6px', fontFamily: 'monospace' }}>
                  {contactError}
                </div>
              )}
            </div>

            {/* Add Group (Connect Group Chat) flat form */}
            <div className="glass-panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '8px', fontFamily: 'monospace' }}>
                $ Groups
              </div>
              <form onSubmit={handleAddGroupSubmit} style={{ display: 'flex', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', background: '#020205', border: '1px solid var(--border-color)', borderRadius: '2px', flex: 1, paddingRight: '8px' }}>
                  <span style={{ color: 'var(--color-secondary)', paddingLeft: '10px', paddingRight: '4px', fontFamily: 'monospace', fontSize: '0.8rem', userSelect: 'none' }}>#</span>
                  <input
                    type="text"
                    className="neon-input"
                    value={newGroupInput}
                    onChange={(e) => setNewGroupInput(e.target.value)}
                    placeholder="group_name..."
                    style={{ padding: '6px 6px 6px 0', fontSize: '0.8rem', background: 'transparent', border: 'none', width: '100%', outline: 'none' }}
                    required
                  />
                </div>
                <button type="submit" className="neon-button" style={{ padding: '6px 12px' }} title="join group chat">
                  <Users size={14} />
                </button>
              </form>
              {groupError && (
                <div style={{ color: 'var(--color-accent)', fontSize: '0.7rem', marginTop: '6px', fontFamily: 'monospace' }}>
                  {groupError}
                </div>
              )}
            </div>

            {/* Active Chats/Connections List */}
            <div className="glass-panel" style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)', minHeight: '200px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '10px', fontFamily: 'monospace' }}>
                $ Rooms
              </div>
              
              {contacts.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--color-text-muted)', textAlign: 'center', padding: '10px' }}>
                  <p style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>total 0 secure_channels</p>
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {contacts.map((contact) => {
                    const isSelected = selectedContact === contact.username;
                    const isOnline = onlineUsers.includes(contact.username.toLowerCase());
                    
                    return (
                      <button
                        key={contact.username}
                        onClick={() => onSelectContact(contact.username)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '8px 10px',
                          background: isSelected ? '#122612' : '#040804',
                          border: '1px solid',
                          borderColor: isSelected ? 'var(--color-primary)' : 'var(--border-color)',
                          borderRadius: '2px',
                          color: isSelected ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.1s',
                          textAlign: 'left',
                          fontFamily: 'monospace',
                          fontSize: '0.8rem'
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = 'var(--color-primary)';
                            e.currentTarget.style.background = '#071007';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = 'var(--border-color)';
                            e.currentTarget.style.background = '#040804';
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            color: isOnline ? 'var(--color-success)' : 'var(--color-text-muted)',
                            fontWeight: 'bold'
                          }}>
                            {isOnline ? '●' : '○'}
                          </span>
                          <span>[{contact.username.toLowerCase()}]</span>
                          {(() => {
                            const cRing = onlineUsersLevels[contact.username.toLowerCase()];
                            if (contact.username.toLowerCase() === 'root') {
                              return <span style={{ fontSize: '0.6rem', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', borderRadius: '2px', padding: '0 3px', fontWeight: 'bold' }}>root</span>;
                            }
                            if (cRing !== undefined) {
                              const badgeName = cRing === 0 ? 'sysop' : cRing === 1 ? 'kernel' : cRing === 2 ? 'operator' : 'guest';
                              const badgeColor = cRing === 0 ? '#00ff66' : cRing === 1 ? '#8be9fd' : cRing === 2 ? '#ffb000' : '#888888';
                              return <span style={{ fontSize: '0.6rem', color: badgeColor, border: `1px solid ${badgeColor}`, borderRadius: '2px', padding: '0 3px' }}>{badgeName}</span>;
                            }
                            return null;
                          })()}
                        </div>

                        {contact.unreadCount > 0 && (
                          <span style={{
                            background: 'var(--color-accent)',
                            color: 'white',
                            fontSize: '0.65rem',
                            fontWeight: 'bold',
                            padding: '1px 6px',
                            borderRadius: '2px'
                          }}>
                            {contact.unreadCount}m
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Pinned Theme Settings at the Bottom */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-panel)', flexShrink: 0 }}>
        <div className="glass-panel" style={{ padding: '12px', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '8px', fontFamily: 'monospace' }}>
            $ Themes
          </div>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as any)}
            className="neon-input"
            style={{
              padding: '6px 10px',
              fontSize: '0.8rem',
              background: '#020202',
              color: 'var(--color-primary)',
              fontFamily: 'monospace',
              border: '1px solid var(--border-color)',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="monochrome">Monochrome Silver</option>
            <option value="cyberpunk">Cyberpunk Poison</option>
            <option value="nebula">Deep Space Nebula</option>
            <option value="amber">Phosphor Amber</option>
          </select>
        </div>
      </div>

    </div>
  );
};
