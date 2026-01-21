import React, { useEffect, useState } from 'react';
import { AgentPersona } from '../types';
import { useLiveAgent } from '../hooks/useLiveAgent';
import { Visualizer } from './Visualizer';

interface LiveInterfaceProps {
  agent: AgentPersona;
  onExit: () => void;
}

export const LiveInterface: React.FC<LiveInterfaceProps> = ({ agent, onExit }) => {
  const { connect, disconnect, isConnected, isSpeaking, volumeLevels, error } = useLiveAgent({ agent });
  const [sessionTime, setSessionTime] = useState(0);

  useEffect(() => {
    let interval: number;
    if (isConnected) {
      interval = window.setInterval(() => {
        setSessionTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isConnected]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <div className="relative w-full h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black opacity-80"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
      </div>

      {/* Connection Error Overlay */}
      {error && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-red-900/80 border border-red-500 text-red-100 px-6 py-3 rounded-lg backdrop-blur-sm z-50">
           ⚠ CONNECTION ERROR: {error}
        </div>
      )}

      {/* Main Holographic Container */}
      <div className="relative z-10 w-full max-w-4xl px-6 flex flex-col items-center">
        
        {/* Agent Name Badge */}
        <div className="mb-10 text-center animate-float">
          <div className="inline-block border border-cyan-500/30 bg-slate-900/60 backdrop-blur-md px-8 py-2 rounded-full shadow-[0_0_20px_rgba(34,211,238,0.2)]">
            <h2 className="text-3xl font-mono font-bold text-white tracking-[0.2em] drop-shadow-lg">
              {agent.name.toUpperCase()}
            </h2>
            <div className="flex items-center justify-center gap-2 mt-1">
               <span className={`block w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
               <span className="text-xs text-cyan-300 font-sans tracking-widest uppercase">
                 {isConnected ? `ONLINE • ${formatTime(sessionTime)}` : 'OFFLINE'}
               </span>
            </div>
          </div>
        </div>

        {/* Central Visualizer Core */}
        <div className="relative w-80 h-80 md:w-96 md:h-96 mb-12 flex items-center justify-center">
            {/* Rotating Rings */}
            <div className={`absolute inset-0 border-2 border-dashed border-slate-700 rounded-full ${isConnected ? 'animate-spin-slow' : ''}`}></div>
            <div className={`absolute inset-4 border border-cyan-900/40 rounded-full ${isConnected ? 'animate-spin-slow' : ''} style={{animationDirection: 'reverse'}}`}></div>
            
            {/* Core Glow */}
            <div className={`
               absolute w-64 h-64 rounded-full bg-gradient-to-br ${agent.avatarColor} opacity-20 blur-2xl transition-all duration-300
               ${isSpeaking ? 'scale-110 opacity-40' : 'scale-100'}
            `}></div>

            {/* Visualizer Canvas Container */}
            <div className="relative z-20 w-full h-64 flex flex-col justify-center gap-2">
               {/* Output (Agent) Visualizer */}
               <div className="w-full h-24 relative">
                  <Visualizer level={volumeLevels.output} color="#00f3ff" isActive={isConnected} />
                  <div className="absolute top-2 right-12 text-[9px] font-mono text-cyan-500/40 uppercase tracking-widest">
                     AGENT_VOICE
                  </div>
               </div>
               
               {/* Input (Mic) Visualizer - Mirrored */}
               <div className="w-full h-24 relative transform scale-y-[-1]">
                  <Visualizer level={volumeLevels.input} color="#bc13fe" isActive={isConnected} />
               </div>
               {/* Mic Label (Absolute to avoid transform flip) */}
               <div className="absolute bottom-6 right-12 text-[9px] font-mono text-purple-500/40 uppercase tracking-widest pointer-events-none">
                  USER_MIC
               </div>
            </div>
        </div>

        {/* Controls */}
        <div className="flex gap-6 z-20">
          {!isConnected ? (
            <button
              onClick={connect}
              className="group relative px-8 py-4 bg-transparent overflow-hidden rounded-lg"
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-cyan-500 to-blue-600 opacity-80 group-hover:opacity-100 transition-opacity"></div>
              <div className="absolute inset-0 blur-md bg-cyan-400 opacity-40 group-hover:opacity-60"></div>
              <span className="relative text-white font-mono font-bold text-lg tracking-widest uppercase flex items-center gap-2">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                 Connect Neural Link
              </span>
            </button>
          ) : (
             <button
              onClick={disconnect}
              className="group relative px-8 py-4 bg-transparent overflow-hidden rounded-lg"
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-red-600 to-pink-600 opacity-80 group-hover:opacity-100 transition-opacity"></div>
              <span className="relative text-white font-mono font-bold text-lg tracking-widest uppercase flex items-center gap-2">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                 Terminate Link
              </span>
            </button>
          )}

          <button
             onClick={onExit}
             className="px-6 py-4 border border-slate-700 bg-slate-900/50 rounded-lg text-slate-300 hover:text-white hover:border-slate-500 transition-all font-mono uppercase text-sm tracking-wider"
          >
            Configure
          </button>
        </div>

        {/* Status Text */}
        <div className="mt-8 text-center h-6">
            <p className="text-cyan-400/80 font-mono text-sm tracking-widest animate-pulse">
                {isSpeaking ? "RECEIVING TRANSMISSION..." : (isConnected ? "AWAITING AUDIO INPUT..." : "SYSTEM STANDBY")}
            </p>
        </div>

      </div>
    </div>
  );
};