import React, { useState, useEffect } from 'react';
import { Shield, Key, Copy, Check, Info, RefreshCw } from 'lucide-react';

interface KeySetupProps {
  recipient: string;
  sender: string;
  currentKey: string;
  onSetKey: (key: string) => void;
}

export const KeySetup: React.FC<KeySetupProps> = ({ recipient, sender, currentKey, onSetKey }) => {
  const [passphrase, setPassphrase] = useState(currentKey);
  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    setPassphrase(currentKey);
  }, [currentKey]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase.trim()) {
      onSetKey(passphrase.trim());
    }
  };

  const generateRandomKey = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'xt-';
    for (let i = 0; i < 10; i++) {
      if (i === 5) result += '-';
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassphrase(result);
  };

  const getInviteLink = () => {
    // Generate secure link containing key inside hash, which the server never sees!
    const keyParam = encodeURIComponent(passphrase || currentKey);
    const senderParam = encodeURIComponent(sender);
    const link = `${window.location.origin}/#key=${keyParam}&join=${senderParam}`;
    return link;
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(getInviteLink());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link', err);
    }
  };

  return (
    <div className="glass-panel glow-violet fade-in" style={{ padding: '24px', maxWidth: '480px', margin: '20px auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{
          background: 'var(--color-secondary-glow)',
          border: '1px solid var(--color-secondary)',
          borderRadius: '10px',
          padding: '8px',
          color: 'var(--color-secondary)'
        }}>
          <Shield size={22} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.2rem', color: 'var(--color-text-primary)' }}>End-to-End Encryption</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Chatting securely with <span style={{ color: 'var(--color-primary)' }}>{recipient}</span></p>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
            Secret Shareable Key (Passphrase)
          </label>
          <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
            <Key size={18} style={{ position: 'absolute', left: '14px', top: '15px', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="neon-input secondary"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter a secret passphrase"
              style={{ paddingLeft: '44px' }}
              required
            />
            <button
              type="button"
              className="neon-button ghost"
              onClick={generateRandomKey}
              title="Generate strong key"
              style={{ padding: '12px', flexShrink: 0 }}
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="submit" className="neon-button secondary" style={{ flex: 1, padding: '12px' }}>
            Lock Private Key
          </button>
          
          {currentKey && (
            <button
              type="button"
              className="neon-button ghost"
              onClick={handleCopyLink}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '12px' }}
            >
              {copied ? <Check size={18} style={{ color: 'var(--color-success)' }} /> : <Copy size={18} />}
              <span>{copied ? 'Copied!' : 'Invite Link'}</span>
            </button>
          )}
        </div>
      </form>

      {/* Security notice and explanation */}
      <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
        <button
          onClick={() => setShowInfo(!showInfo)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-secondary)',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer'
          }}
        >
          <Info size={14} />
          <span>Why do we need a secret key? Learn more</span>
        </button>

        {showInfo && (
          <div style={{
            marginTop: '10px',
            padding: '12px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '8px',
            fontSize: '0.75rem',
            lineHeight: 1.4,
            color: 'var(--color-text-secondary)',
            animation: 'fadeIn 0.25s ease'
          }}>
            <p style={{ marginBottom: '8px' }}>
              <strong>Zero-Knowledge E2EE:</strong> Xtassy encrypts your messages and files *inside your browser* before sending them.
            </p>
            <p style={{ marginBottom: '8px' }}>
              The key is **never** sent to the server. The invite link contains the key in the URL hash (after `#`), meaning the browser keeps it strictly local and does not transmit it across the network.
            </p>
            <p>
              To read your messages, <strong>{recipient}</strong> must use this exact same passphrase. Share this key via a secure external channel, or copy the invite link above!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
