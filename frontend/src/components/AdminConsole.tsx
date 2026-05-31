import React, { useState, useEffect } from 'react';
import { Shield, Users, Radio, MessageSquare, Trash2, ArrowLeft, Send } from 'lucide-react';

interface UserSession {
  username: string;
  online: boolean;
  lastActive: number;
}

interface AdminConsoleProps {
  adminToken: string;
  backendUrl: string;
  onBack: () => void;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({
  adminToken,
  backendUrl,
  onBack
}) => {
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<UserSession[]>([]);
  const [rooms, setRooms] = useState<{ [roomName: string]: number }>({});
  const [broadcastInput, setBroadcastInput] = useState('');
  const [broadcastLog, setBroadcastLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Poll server stats every 2 seconds
  useEffect(() => {
    let active = true;

    const fetchStats = async () => {
      try {
        const response = await fetch(`${backendUrl}/api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'admin_stats', adminToken })
        });
        
        if (!response.ok) {
          throw new Error('Admin stats authentication rejected.');
        }

        const data = await response.json();
        if (!active) return;

        if (data.success) {
          setStats(data.stats);
          setUsers(data.users);
          setRooms(data.rooms);
          setError(null);
        } else {
          setError(data.error || 'Failed to fetch stats');
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to establish admin heartbeat.');
        }
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [adminToken, backendUrl]);

  // Action: Kick User
  const handleKick = async (targetUsername: string) => {
    try {
      const response = await fetch(`${backendUrl}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'admin_kick', adminToken, targetUsername })
      });
      const data = await response.json();
      if (data.success) {
        showActionMessage(`User [${targetUsername}] successfully evicted.`);
      } else {
        showActionMessage(`Failed to kick: ${data.error}`);
      }
    } catch (err: any) {
      showActionMessage(`Eviction failed: ${err.message}`);
    }
  };

  // Action: Ban User
  const handleBan = async (targetUsername: string) => {
    try {
      const response = await fetch(`${backendUrl}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'admin_ban', adminToken, targetUsername })
      });
      const data = await response.json();
      if (data.success) {
        showActionMessage(`User [${targetUsername}] permanently banned.`);
      } else {
        showActionMessage(`Failed to ban: ${data.error}`);
      }
    } catch (err: any) {
      showActionMessage(`Ban failed: ${err.message}`);
    }
  };

  // Action: Nuke Room
  const handleNukeRoom = async (targetRoom: string) => {
    if (!window.confirm(`Are you sure you want to nuke [${targetRoom}]? This burns all of its in-memory contents!`)) return;
    try {
      const response = await fetch(`${backendUrl}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'admin_nuke_room', adminToken, targetRoom })
      });
      const data = await response.json();
      if (data.success) {
        showActionMessage(`Room [${targetRoom}] completely nuked (${data.burnedCount} messages burned).`);
      } else {
        showActionMessage(`Failed to nuke room: ${data.error}`);
      }
    } catch (err: any) {
      showActionMessage(`Room nuke failed: ${err.message}`);
    }
  };

  // Action: Broadcast message
  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = broadcastInput.trim();
    if (!msg) return;

    try {
      const response = await fetch(`${backendUrl}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'admin_broadcast', adminToken, broadcastMessage: msg })
      });
      const data = await response.json();
      if (data.success) {
        setBroadcastLog(prev => [`[${new Date().toLocaleTimeString()}] BROADCAST: ${msg}`, ...prev]);
        setBroadcastInput('');
        showActionMessage('System-wide broadcast alert sent successfully.');
      } else {
        showActionMessage(`Broadcast failed: ${data.error}`);
      }
    } catch (err: any) {
      showActionMessage(`Broadcast failed: ${err.message}`);
    }
  };

  const showActionMessage = (msg: string) => {
    setActionMessage(msg);
    setTimeout(() => setActionMessage(null), 4000);
  };

  // Format memory
  const formatMB = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  // Render ASCII progress bar
  const renderProgressBar = (used: number, total: number) => {
    const ratio = total > 0 ? used / total : 0;
    const blocksCount = Math.floor(ratio * 30);
    const emptyCount = 30 - blocksCount;
    return `[${'█'.repeat(blocksCount)}${'░'.repeat(emptyCount)}] ${(ratio * 100).toFixed(1)}%`;
  };

  // Format uptime
  const formatUptime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs}h ${mins}m ${secs}s`;
  };

  return (
    <div 
      style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%', 
        background: '#020202', 
        color: 'var(--color-primary)', 
        fontFamily: 'monospace', 
        padding: '20px', 
        overflowY: 'auto' 
      }}
    >
      {/* Top Header */}
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          borderBottom: '1px solid var(--border-color)', 
          paddingBottom: '10px', 
          marginBottom: '20px' 
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            onClick={onBack}
            className="neon-button" 
            style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
          >
            <ArrowLeft size={12} />
            <span>[cd ..]</span>
          </button>
          <span style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--color-accent)', textShadow: '0 0 8px var(--color-accent)' }}>
            root@xtassy-node:~# sys_admin_console
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
          <Shield size={12} style={{ color: 'var(--color-accent)' }} />
          <span>secure root credentials loaded</span>
        </div>
      </div>

      {error && (
        <div 
          style={{ 
            background: 'rgba(255, 0, 79, 0.1)', 
            border: '1px dashed var(--color-accent)', 
            color: 'var(--color-accent)', 
            padding: '12px', 
            fontSize: '0.8rem', 
            marginBottom: '20px',
            textShadow: '0 0 4px var(--color-accent)'
          }}
        >
          [SYSTEM CRITICAL ERROR]: {error}
        </div>
      )}

      {actionMessage && (
        <div 
          style={{ 
            background: 'rgba(0, 242, 254, 0.1)', 
            border: '1px dashed var(--color-primary)', 
            color: 'var(--color-primary)', 
            padding: '12px', 
            fontSize: '0.8rem', 
            marginBottom: '20px',
            textShadow: '0 0 4px var(--color-primary)'
          }}
        >
          [sys_kernel]: {actionMessage}
        </div>
      )}

      {/* HTOP Visual Metric Panels */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'window.innerWidth < 992 ? "1fr" : "1fr 1fr"', 
          gap: '20px', 
          marginBottom: '20px', 
          border: '1px solid var(--border-color)', 
          padding: '16px', 
          background: '#040804' 
        }}
      >
        {/* Left Stats Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
          <div>
            <strong style={{ color: 'var(--color-secondary)' }}>CPU Heap Mem : </strong>
            {stats ? renderProgressBar(stats.heapUsed, stats.heapTotal) : 'Loading...'}
          </div>
          <div>
            <strong style={{ color: 'var(--color-secondary)' }}>Heap Allocation : </strong>
            {stats ? `${formatMB(stats.heapUsed)} used / ${formatMB(stats.heapTotal)} total` : 'Loading...'}
          </div>
          <div>
            <strong style={{ color: 'var(--color-secondary)' }}>System Uptime   : </strong>
            {stats ? formatUptime(stats.uptime) : 'Loading...'}
          </div>
        </div>

        {/* Right Stats Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem' }}>
          <div>
            <strong style={{ color: 'var(--color-secondary)' }}>Active Clients  : </strong>
            {stats ? `${stats.onlineCount} online / ${stats.usersCount} registered` : 'Loading...'}
          </div>
          <div>
            <strong style={{ color: 'var(--color-secondary)' }}>In-Memory Chats : </strong>
            {stats ? `${stats.messagesCount} active encrypted envelopes` : 'Loading...'}
          </div>
          <div>
            <strong style={{ color: 'var(--color-secondary)' }}>Buffered Files  : </strong>
            {stats ? `${stats.filesCount} E2EE attachments in volatile RAM` : 'Loading...'}
          </div>
        </div>
      </div>

      {/* Main Administrative Action Panel splits */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
          gap: '20px',
          flex: 1
        }}
      >
        {/* Panel 1: Online Users */}
        <div 
          className="glass-panel" 
          style={{ 
            background: '#030503', 
            border: '1px solid var(--border-color)', 
            padding: '16px', 
            display: 'flex', 
            flexDirection: 'column', 
            maxHeight: '400px' 
          }}
        >
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              color: 'var(--color-secondary)', 
              fontWeight: 'bold', 
              fontSize: '0.85rem', 
              borderBottom: '1px dashed var(--border-color)', 
              paddingBottom: '8px', 
              marginBottom: '12px' 
            }}
          >
            <Users size={14} />
            <span>┌── Registered Core Sessions (Active Users)</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {users.length === 0 ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '20px' }}>
                No registered sessions on node.
              </div>
            ) : (
              users.map(u => (
                <div 
                  key={u.username}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '6px 10px', 
                    background: '#060a06', 
                    border: '1px solid var(--border-color)', 
                    fontSize: '0.8rem' 
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: u.online ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                      {u.online ? '●' : '○'}
                    </span>
                    <span>[{u.username}]</span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button 
                      onClick={() => handleKick(u.username)}
                      style={{ 
                        background: 'none', 
                        border: '1px solid var(--color-accent)', 
                        color: 'var(--color-accent)', 
                        fontFamily: 'monospace', 
                        fontSize: '0.65rem', 
                        padding: '2px 6px', 
                        cursor: 'pointer' 
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-accent)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                      KICK
                    </button>
                    <button 
                      onClick={() => handleBan(u.username)}
                      style={{ 
                        background: 'none', 
                        border: '1px solid var(--color-accent)', 
                        color: 'var(--color-accent)', 
                        fontFamily: 'monospace', 
                        fontSize: '0.65rem', 
                        padding: '2px 6px', 
                        cursor: 'pointer' 
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-accent)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                      BAN
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel 2: Volatile Rooms & Groups */}
        <div 
          className="glass-panel" 
          style={{ 
            background: '#030503', 
            border: '1px solid var(--border-color)', 
            padding: '16px', 
            display: 'flex', 
            flexDirection: 'column', 
            maxHeight: '400px' 
          }}
        >
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              color: 'var(--color-secondary)', 
              fontWeight: 'bold', 
              fontSize: '0.85rem', 
              borderBottom: '1px dashed var(--border-color)', 
              paddingBottom: '8px', 
              marginBottom: '12px' 
            }}
          >
            <MessageSquare size={14} />
            <span>┌── Active Cryptographic Channels (Rooms)</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Object.keys(rooms).length === 0 ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', textAlign: 'center', padding: '20px' }}>
                No active secure paths mapped in RAM.
              </div>
            ) : (
              Object.entries(rooms).map(([roomName, msgCount]) => (
                <div 
                  key={roomName}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: '6px 10px', 
                    background: '#060a06', 
                    border: '1px solid var(--border-color)', 
                    fontSize: '0.8rem' 
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontWeight: 'bold' }}>{roomName}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--color-text-secondary)' }}>
                      {msgCount} buffered envelopes
                    </span>
                  </div>
                  <button 
                    onClick={() => handleNukeRoom(roomName)}
                    style={{ 
                      background: 'none', 
                      border: '1px solid var(--color-accent)', 
                      color: 'var(--color-accent)', 
                      fontFamily: 'monospace', 
                      fontSize: '0.65rem', 
                      padding: '4px 8px', 
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-accent)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    title="Nuke room messages"
                  >
                    <Trash2 size={10} />
                    <span>NUKE</span>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel 3: Global System Broadcast */}
        <div 
          className="glass-panel" 
          style={{ 
            background: '#030503', 
            border: '1px solid var(--border-color)', 
            padding: '16px', 
            display: 'flex', 
            flexDirection: 'column', 
            maxHeight: '400px' 
          }}
        >
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              color: 'var(--color-secondary)', 
              fontWeight: 'bold', 
              fontSize: '0.85rem', 
              borderBottom: '1px dashed var(--border-color)', 
              paddingBottom: '8px', 
              marginBottom: '12px' 
            }}
          >
            <Radio size={14} />
            <span>┌── Global Network Broadcast Alert</span>
          </div>

          <form onSubmit={handleBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{ color: 'var(--color-accent)', marginRight: '10px', fontWeight: 'bold' }}>#</span>
              <input
                type="text"
                className="neon-input"
                value={broadcastInput}
                onChange={(e) => setBroadcastInput(e.target.value)}
                placeholder="type systemic warning message here..."
                style={{ 
                  background: '#020502', 
                  borderTop: 'none', 
                  borderLeft: 'none', 
                  borderRight: 'none', 
                  borderBottom: '1px solid var(--border-color)', 
                  color: 'var(--color-accent)', 
                  flex: 1, 
                  padding: '6px 0', 
                  outline: 'none',
                  fontSize: '0.8rem'
                }}
                required
              />
            </div>
            <button 
              type="submit" 
              className="neon-button" 
              style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem' }}
            >
              <Send size={12} />
              <span>[ TRANSMIT BROADCAST ]</span>
            </button>
          </form>

          {/* Broadcast history log */}
          <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', background: '#020402', padding: '10px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', marginBottom: '8px' }}>
              System Broadcast Log :
            </div>
            {broadcastLog.length === 0 ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: '0.68rem', textAlign: 'center', padding: '10px' }}>
                No active broadcasts sent this session.
              </div>
            ) : (
              broadcastLog.map((log, i) => (
                <div key={i} style={{ color: 'var(--color-accent)', fontSize: '0.7rem', lineHeight: '1.4', marginBottom: '4px', wordBreak: 'break-all' }}>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
