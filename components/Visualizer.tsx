import React, { useRef, useEffect } from 'react';

interface VisualizerProps {
  level: number; // 0 to 1 (amplitude)
  color: string; // Hex or rgba
  isActive: boolean; // If false, draws a flat line
}

export const Visualizer: React.FC<VisualizerProps> = ({ level, color, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let currentLevel = 0;
    let phase = 0;

    const draw = () => {
        // Smooth dampening of level for fluid motion
        currentLevel += (level - currentLevel) * 0.2;
        
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);
        
        // Base Line Style
        ctx.shadowBlur = isActive ? 10 : 0;
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        
        // If inactive or silent
        if (!isActive || currentLevel < 0.01) {
            ctx.moveTo(0, centerY);
            ctx.lineTo(width, centerY);
            ctx.stroke();
            
            // Minimal "heartbeat" or static if active but silent
            if (isActive) {
                 phase += 0.05;
            }
        } else {
            const segments = 100;
            const spacing = width / segments;
            ctx.moveTo(0, centerY);

            for (let i = 0; i <= segments; i++) {
               const x = i * spacing;
               // Normalized position (0 to 1)
               const t = i / segments; 
               // Window function (Bell curve) to keep edges attached to center
               const window = Math.sin(t * Math.PI); 

               // Compose Wave
               // Main frequency
               const y1 = Math.sin(t * 10 + phase) * 0.5;
               // Secondary frequency
               const y2 = Math.sin(t * 23 - phase * 1.5) * 0.25;
               // Noise/Jitter
               const noise = (Math.random() - 0.5) * 0.2;

               const amplitude = (y1 + y2 + noise) * currentLevel * (height * 0.8) * window;
               
               ctx.lineTo(x, centerY + amplitude);
            }
            ctx.stroke();
            phase += 0.15 + (currentLevel * 0.2); // Spin faster when louder
        }

        animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [level, color, isActive]);

  return (
    <canvas 
      ref={canvasRef} 
      width={600} 
      height={200} 
      className="w-full h-full block" 
    />
  );
};