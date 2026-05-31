import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Shield } from 'lucide-react';
import { decryptFile } from '../crypto';

interface AudioPlayerProps {
  fileBlobId: string;
  fileMeta: {
    type: 'voice';
    duration: number;
    iv: string;
    salt: string;
    size: number;
  };
  sharedKey: string;
  isBurned?: boolean;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ fileBlobId, fileMeta, sharedKey, isBurned }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDecrypted, setIsDecrypted] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(fileMeta.duration || 0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  useEffect(() => {
    // Decrypt the file immediately on mount
    decryptAudioData();

    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, [fileBlobId]);

  const decryptAudioData = async () => {
    if (!sharedKey || isDecrypted || isDecrypting || isBurned) return;

    try {
      setIsDecrypting(true);

      // 1. Fetch the encrypted ephemeral file as ArrayBuffer
      const backendUrl = localStorage.getItem('xtassy_backend_url') || import.meta.env.VITE_BACKEND_URL || window.location.origin;
      const response = await fetch(`${backendUrl}/api/file/${fileBlobId}`);
      if (!response.ok) {
        throw new Error('Failed to retrieve ephemeral file');
      }

      const encryptedBuffer = await response.arrayBuffer();

      // 2. Decrypt client-side using Web Crypto AES-GCM
      const decryptedBuffer = await decryptFile(
        encryptedBuffer,
        fileMeta.iv,
        fileMeta.salt,
        sharedKey
      );

      // 3. Create a local URL for the decrypted audio
      const decryptedBlob = new Blob([decryptedBuffer], { type: 'audio/webm' });
      const url = URL.createObjectURL(decryptedBlob);

      setAudioUrl(url);
      setIsDecrypted(true);
    } catch (err) {
      console.error('Audio decryption failed:', err);
    } finally {
      setIsDecrypting(false);
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current || !isDecrypted) return;

    const audio = audioRef.current;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
        setupVisualizer();
      }).catch(err => console.error('Audio playback failed', err));
    }
  };

  const setupVisualizer = () => {
    if (!audioRef.current || !canvasRef.current) return;
    if (audioCtxRef.current) return; // already set up

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;

      const source = audioCtx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);

      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      visualize();
    } catch (err) {
      console.warn('Web Audio API visualizer initialization skipped', err);
    }
  };

  const visualize = () => {
    const canvas = canvasRef.current;
    if (!canvas || !analyserRef.current) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      const rootStyle = getComputedStyle(document.documentElement);
      const primaryColor = rootStyle.getPropertyValue('--color-primary').trim() || '#00ff66';

      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 1.6;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const percent = dataArray[i] / 255;
        const barHeight = percent * canvas.height * 0.75;

        ctx.fillStyle = primaryColor;
        ctx.shadowBlur = 4;
        ctx.shadowColor = primaryColor;

        ctx.fillRect(
          x,
          (canvas.height - barHeight) / 2,
          barWidth - 2,
          barHeight
        );

        x += barWidth;
      }
      ctx.shadowBlur = 0;
    };

    draw();
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const formatTime = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div 
      className="glass-panel" 
      style={{ 
        padding: '10px 14px', 
        borderRadius: '8px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px',
        maxWidth: '320px',
        width: '100%',
        background: 'rgba(0, 0, 0, 0.5)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--glass-shadow)',
        margin: '6px 0'
      }}
    >
      {isDecrypted && audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleAudioEnded}
          style={{ display: 'none' }}
        />
      ) : null}

      <button
        onClick={handlePlayPause}
        disabled={!isDecrypted}
        className="neon-button secondary"
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          padding: 0,
          flexShrink: 0,
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {isPlaying ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: isDecrypted ? '2px' : 0 }} />}
      </button>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--color-text-secondary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Shield size={10} color="var(--color-primary)" />
            <span>{isDecrypting ? 'DECRYPTING...' : 'AES-256 E2EE VOICE'}</span>
          </span>
          <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>

        <div style={{ height: '22px', background: 'rgba(0,0,0,0.4)', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
          {isPlaying ? (
            <canvas ref={canvasRef} width={200} height={22} style={{ width: '100%', height: '100%' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              {/* Fake progress bar track */}
              <div 
                style={{ 
                  height: '2px', 
                  background: 'var(--border-color)', 
                  width: '90%', 
                  position: 'absolute', 
                  top: '50%', 
                  left: '5%',
                  transform: 'translateY(-50%)'
                }} 
              />
              <div 
                style={{ 
                  height: '2px', 
                  background: 'var(--color-primary)', 
                  width: `${(currentTime / (duration || 1)) * 90}%`, 
                  position: 'absolute', 
                  top: '50%', 
                  left: '5%',
                  transform: 'translateY(-50%)'
                }} 
              />
              <div 
                style={{ 
                  width: '6px', 
                  height: '6px', 
                  borderRadius: '50%', 
                  background: 'var(--color-primary)', 
                  boxShadow: '0 0 6px var(--color-primary)',
                  position: 'absolute', 
                  top: '50%', 
                  left: `calc(5% + ${(currentTime / (duration || 1)) * 90}% - 3px)`,
                  transform: 'translateY(-50%)'
                }} 
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
