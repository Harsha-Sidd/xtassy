import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Send } from 'lucide-react';
import { encryptFile } from '../crypto';

interface AudioRecorderProps {
  sharedKey: string;
  onSendAudio: (fileBlobId: string, duration: number, fileMeta: any) => void;
  onCancel: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({ sharedKey, onSendAudio, onCancel }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Clean up references on unmount
  useEffect(() => {
    return () => {
      stopRecordingResources();
    };
  }, []);

  const stopRecordingResources = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
  };

  const startRecording = async () => {
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      // Set up Audio Visualizer
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 64;
      
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioBlob(audioBlob);
        setAudioUrl(url);
        stream.getTracks().forEach(track => track.stop());
        stopRecordingResources();
      };

      setIsRecording(true);
      setDuration(0);
      setAudioUrl(null);
      setAudioBlob(null);

      // Start recording
      mediaRecorder.start();

      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      // Start canvas waveform visualization
      visualize();
    } catch (err) {
      console.error('Failed to access microphone', err);
      alert('Microphone access is required for voice notes.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const deleteRecording = () => {
    stopRecordingResources();
    setIsRecording(false);
    setAudioUrl(null);
    setAudioBlob(null);
    setDuration(0);
    onCancel();
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
      if (!isRecording) return;
      animationFrameRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      // Get primary glowing theme colors from document style
      const rootStyle = getComputedStyle(document.documentElement);
      const primaryColor = rootStyle.getPropertyValue('--color-primary').trim() || '#00ff66';

      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const percent = dataArray[i] / 255;
        const barHeight = percent * canvas.height * 0.8;

        // Draw symmetrical bar visualizer
        ctx.fillStyle = primaryColor;
        ctx.shadowBlur = 6;
        ctx.shadowColor = primaryColor;
        
        ctx.fillRect(
          x,
          (canvas.height - barHeight) / 2,
          barWidth - 2,
          barHeight
        );

        x += barWidth;
      }
      ctx.shadowBlur = 0; // reset
    };

    draw();
  };

  const sendRecording = async () => {
    if (!audioBlob || !sharedKey) return;

    try {
      setIsUploading(true);

      // 1. Convert blob to ArrayBuffer
      const rawBuffer = await audioBlob.arrayBuffer();

      // 2. Encrypt binary ArrayBuffer client-side with the passphrase
      const { encryptedData, iv, salt } = await encryptFile(rawBuffer, sharedKey);

      // 3. Upload encrypted buffer as ephemeral file blob
      const formData = new FormData();
      const encryptedBlob = new Blob([encryptedData], { type: 'application/octet-stream' });
      formData.append('file', encryptedBlob, 'voice_memo.enc');

      const backendUrl = localStorage.getItem('xtassy_backend_url') || import.meta.env.VITE_BACKEND_URL || window.location.origin;
      const response = await fetch(`${backendUrl}/api/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Server returned upload error');
      }

      const resJson = await response.json();
      
      // 4. Send encrypted payload details via socket
      const fileMeta = {
        type: 'voice',
        duration,
        iv,
        salt,
        size: audioBlob.size
      };

      onSendAudio(resJson.fileBlobId, duration, fileMeta);
      
      // Reset
      deleteRecording();
    } catch (err) {
      console.error('Audio encryption or upload failed', err);
      alert('Failed to securely upload audio.');
    } finally {
      setIsUploading(false);
    }
  };

  const formatTime = (secs: number) => {
    const minutes = Math.floor(secs / 60);
    const seconds = secs % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <div 
      className="glass-panel" 
      style={{ 
        padding: '16px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        gap: '16px', 
        width: '100%',
        borderRadius: '4px',
        background: 'var(--bg-panel-solid)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
        {!audioUrl ? (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className="neon-button"
            style={{ 
              width: '42px', 
              height: '42px', 
              borderRadius: '50%', 
              padding: 0,
              backgroundColor: isRecording ? 'var(--color-accent)' : 'var(--bg-panel)' 
            }}
          >
            {isRecording ? <Square size={16} color="#000000" /> : <Mic size={18} />}
          </button>
        ) : (
          <button
            onClick={deleteRecording}
            className="neon-button danger"
            style={{ width: '42px', height: '42px', borderRadius: '50%', padding: 0 }}
          >
            <Trash2 size={16} />
          </button>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            <span>{isRecording ? '🔐 EPHEMERAL RECORDING' : audioUrl ? '🔐 DECRYPTED MEMO READY' : 'CLICK MIC TO RECORD SECURE VOICE NOTE'}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div style={{ height: '36px', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
            {isRecording ? (
              <canvas ref={canvasRef} width={380} height={36} style={{ width: '100%', height: '100%' }} />
            ) : audioUrl ? (
              <div style={{ padding: '0 12px', fontSize: '0.8rem', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="status-dot online"></span>
                <span>File locked with AES-GCM (Ready to Encrypt & Relay)</span>
              </div>
            ) : (
              <div style={{ padding: '0 12px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Audio stream fully offline and un-networked until you press Send.
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        {audioUrl && (
          <button
            onClick={sendRecording}
            disabled={isUploading}
            className="neon-button"
            style={{ 
              height: '42px', 
              padding: '0 18px', 
              fontSize: '0.8rem',
              backgroundColor: 'var(--color-primary)',
              color: '#000000'
            }}
          >
            <Send size={14} />
            <span>{isUploading ? 'Relaying...' : 'Send'}</span>
          </button>
        )}
        <button
          onClick={deleteRecording}
          className="neon-button ghost"
          style={{ height: '42px', fontSize: '0.8rem' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
