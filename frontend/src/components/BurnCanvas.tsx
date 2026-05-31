import React, { useEffect, useRef } from 'react';

interface BurnCanvasProps {
  width: number;
  height: number;
  onComplete: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  gravity: number;
  flicker: number;
}

export const BurnCanvas: React.FC<BurnCanvasProps> = ({ width, height, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = width;
    canvas.height = height;

    const particles: Particle[] = [];
    const colors = [
      '#ff0055', // Neon Pink / Hot Red
      '#ff5500', // Burn Orange
      '#ffaa00', // Spark Yellow
      '#555555', // Grey Ash
      '#222222'  // Dark Charcoal
    ];

    // Generate initial particles distributed across the bubble area
    const particleCount = Math.min(width * height * 0.08, 350);
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 2.5,
        vy: -Math.random() * 2.5 - 0.8, // Float upwards
        size: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1.0,
        decay: Math.random() * 0.015 + 0.008,
        gravity: -0.02, // slight upward float acceleration
        flicker: Math.random() * 0.2
      });
    }

    let animationFrameId: number;

    const render = () => {
      // Clear with very slight fade to leave particle trails
      ctx.fillStyle = 'rgba(6, 7, 11, 0.15)';
      ctx.clearRect(0, 0, width, height);

      let activeParticles = 0;

      particles.forEach((p) => {
        if (p.alpha <= 0) return;

        activeParticles++;

        // Draw particle
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        
        // Add neon glow to orange/red sparks
        if (p.color === '#ff0055' || p.color === '#ff5500') {
          ctx.shadowBlur = 6;
          ctx.shadowColor = p.color;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Update physics
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.alpha -= p.decay;

        // Flicker effect
        if (Math.random() < 0.3) {
          p.alpha += (Math.random() - 0.5) * p.flicker;
          p.alpha = Math.max(0, Math.min(1, p.alpha));
        }
      });

      if (activeParticles > 0) {
        animationFrameId = requestAnimationFrame(render);
      } else {
        // Complete the callback when all embers fade out
        onComplete();
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [width, height, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 10,
        borderRadius: '12px'
      }}
    />
  );
};
