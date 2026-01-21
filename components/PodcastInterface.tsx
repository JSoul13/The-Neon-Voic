
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { AgentPersona, Project, VoiceOption } from '../types';
import { base64ToUint8Array, pcmToWav } from '../utils/audio';
import { saveProject } from '../utils/db';
import { Visualizer } from './Visualizer';
import { DEFAULT_VOICES } from '../constants';

interface PodcastInterfaceProps {
  hostAgent: AgentPersona;
  initialProject?: Project;
  userId?: string;
  onExit: () => void;
}

export const PodcastInterface: React.FC<PodcastInterfaceProps> = ({ hostAgent, initialProject, userId, onExit }) => {
  const [projectName, setProjectName] = useState(initialProject?.name || 'New Multi-Guest Podcast');
  const [guestAgent, setGuestAgent] = useState<AgentPersona>(initialProject?.guestAgent || {
    ...hostAgent,
    id: 'default-guest',
    name: 'Guest Speaker',
    voice: 'Puck', 
    avatarColor: 'from-pink-500 to-purple-500'
  });
  const [text, setText] = useState(initialProject?.text || `${hostAgent.name}: Welcome to the show!\n${guestAgent.name}: Thanks for having me.`);
  const [currentAudioData, setCurrentAudioData] = useState<Int16Array | null>(initialProject?.audioData || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [activeSpeaker, setActiveSpeaker] = useState<'host' | 'guest' | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string>('');

  const audioContextRef = useRef<AudioContext | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  // Manage stable download URL
  useEffect(() => {
    if (currentAudioData) {
      const blob = pcmToWav(currentAudioData, 24000);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setDownloadUrl('');
  }, [currentAudioData]);

  const callTTSWithRetry = async (ai: any, prompt: string, retries = 3) => {
    let lastError;
    for (let i = 0; i < retries; i++) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: prompt }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  {
                    speaker: hostAgent.name,
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: hostAgent.voice as any } }
                  },
                  {
                    speaker: guestAgent.name,
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: guestAgent.voice as any } }
                  }
                ]
              }
            }
          }
        });
        return response;
      } catch (e) {
        lastError = e;
        console.warn(`Podcast attempt ${i + 1} failed, retrying...`, e);
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      }
    }
    throw lastError;
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const rawLines = text.split('\n')
        .map(l => l.trim())
        .filter(l => l.includes(':'))
        .map(l => l.replace(/[*_#~`|>]/g, ''));
      
      const allPcmParts: Int16Array[] = [];

      for (let i = 0; i < rawLines.length; i++) {
        const turnText = rawLines[i];
        if (!turnText.trim()) continue;
        
        // Explicitly identify who is speaking to the model to ensure voice consistency
        const promptText = `Voice Synthesis Turn: ${turnText}\nVoices available: ${hostAgent.name}, ${guestAgent.name}. Please select the matching voice profile.`;
        
        const response = await callTTSWithRetry(ai, promptText);

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const uint8Array = base64ToUint8Array(base64Audio);
          const pcmPart = new Int16Array(uint8Array.buffer);
          allPcmParts.push(pcmPart);
        }
        
        await new Promise(r => setTimeout(r, 600)); // Delay to avoid 429
      }

      if (allPcmParts.length > 0) {
        const totalSamples = allPcmParts.reduce((acc, part) => acc + part.length, 0);
        const mergedPcm = new Int16Array(totalSamples);
        let offset = 0;
        for (const part of allPcmParts) {
          mergedPcm.set(part, offset);
          offset += part.length;
        }

        setCurrentAudioData(mergedPcm);
        if (userId) {
          // Fix: Remove unsupported properties 'ambienceId' and 'ambienceVolume'
          await saveProject({
            id: initialProject?.id || crypto.randomUUID(),
            userId,
            name: projectName,
            createdAt: initialProject?.createdAt || Date.now(),
            updatedAt: Date.now(),
            agent: hostAgent,
            guestAgent,
            text,
            audioData: mergedPcm,
            duration: mergedPcm.length / 24000,
            voiceVolume: 1,
            isPodcast: true
          });
        }
        playAudio(mergedPcm);
      }
    } catch (error) {
      console.error("Podcast generation failed", error);
      alert("Podcast synthesis failed. Try fewer turns or check neural link.");
    } finally {
      setIsLoading(false);
    }
  };

  const playAudio = async (pcm: Int16Array) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const buffer = audioContextRef.current.createBuffer(1, pcm.length, 24000);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 32768;
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    const analyser = audioContextRef.current.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    source.connect(analyser);
    analyser.connect(audioContextRef.current.destination);
    source.onended = () => { setIsPlaying(false); setActiveSpeaker(null); };
    source.start();
    setIsPlaying(true);
  };

  useEffect(() => {
    if (isPlaying && analyserRef.current) {
      const update = () => {
        const data = new Uint8Array(analyserRef.current!.frequencyBinCount);
        analyserRef.current!.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setVolumeLevel(avg / 255);
        animationRef.current = requestAnimationFrame(update);
      };
      update();
    }
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isPlaying]);

  return (
    <div className="w-full min-h-screen bg-slate-950 flex flex-col items-center p-8 overflow-y-auto custom-scrollbar">
       <div className="w-full max-w-5xl space-y-8 animate-fade-in">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
             <div><input className="bg-transparent text-2xl font-mono font-bold text-cyan-400 focus:outline-none" value={projectName} onChange={e => setProjectName(e.target.value)} /><p className="text-slate-500 text-xs font-mono tracking-widest uppercase">Multi-Guest Podcast Studio</p></div>
             <button onClick={onExit} className="text-slate-500 hover:text-white font-mono text-sm uppercase">Close Lab</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block opacity-20"><div className="w-px h-64 bg-gradient-to-b from-transparent via-cyan-500 to-transparent"></div></div>
             <div className={`p-6 bg-slate-900/50 border rounded-2xl transition-all duration-500 ${activeSpeaker === 'host' ? 'border-cyan-500 shadow-[0_0_20px_rgba(34,211,238,0.2)]' : 'border-slate-800'}`}>
                <div className="flex items-center gap-4 mb-4">
                   <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${hostAgent.avatarColor} shadow-lg flex items-center justify-center`}><span className="text-2xl">🎙️</span></div>
                   <div><h3 className="text-white font-mono font-bold uppercase">{hostAgent.name}</h3><span className="text-[10px] text-cyan-500 font-mono tracking-widest uppercase border border-cyan-500/30 px-2 py-0.5 rounded">Host</span></div>
                </div>
                <div className="h-24 bg-slate-950 rounded-lg overflow-hidden relative"><Visualizer level={isPlaying ? volumeLevel : 0} color="#00f3ff" isActive={isPlaying} /></div>
             </div>
             <div className={`p-6 bg-slate-900/50 border rounded-2xl transition-all duration-500 ${activeSpeaker === 'guest' ? 'border-pink-500 shadow-[0_0_20px_rgba(236,72,153,0.2)]' : 'border-slate-800'}`}>
                <div className="flex items-center justify-between mb-4">
                   <div className="flex items-center gap-4">
                      <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${guestAgent.avatarColor} shadow-lg flex items-center justify-center`}><span className="text-2xl">🎧</span></div>
                      <div><h3 className="text-white font-mono font-bold uppercase">{guestAgent.name}</h3><span className="text-[10px] text-pink-500 font-mono tracking-widest uppercase border border-pink-500/30 px-2 py-0.5 rounded">Guest</span></div>
                   </div>
                   <select className="bg-slate-950 text-slate-400 text-[10px] font-mono p-1 border border-slate-700 rounded" value={guestAgent.voice} onChange={(e) => { const v = DEFAULT_VOICES.find(dv => dv.apiId === e.target.value); if (v) setGuestAgent({...guestAgent, voice: v.apiId, avatarColor: v.color}); }}>{DEFAULT_VOICES.map(v => <option key={v.apiId} value={v.apiId}>{v.name}</option>)}</select>
                </div>
                <div className="h-24 bg-slate-950 rounded-lg overflow-hidden relative"><Visualizer level={isPlaying ? volumeLevel : 0} color="#ec4899" isActive={isPlaying} /></div>
             </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6">
             <div className="flex justify-between items-center mb-4"><label className="text-cyan-400 font-mono text-xs uppercase tracking-widest">Conversation Script</label><div className="text-[10px] text-slate-500 font-mono italic">Format: Name: Text</div></div>
             <textarea className="w-full h-64 bg-slate-950 rounded-lg p-6 text-slate-300 font-sans leading-relaxed focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all resize-none" value={text} onChange={e => setText(e.target.value)} placeholder={`${hostAgent.name}: What is your message?`} />
             <div className="mt-6 flex justify-between items-center">
                <p className="text-xs text-slate-500 max-w-xs italic">Each turn must start with 'Name:'. Multi-speaker profiles ensure consistency.</p>
                <button onClick={handleGenerate} disabled={isLoading || !text} className="px-10 py-4 bg-orange-600 hover:bg-orange-500 text-white font-mono font-bold rounded-lg shadow-[0_0_25px_rgba(234,88,12,0.3)] transition-all flex items-center gap-3 disabled:opacity-50">
                   {isLoading ? (<svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>)} SYNTHESIZE PODCAST
                </button>
             </div>
          </div>
          {currentAudioData && !isLoading && (
            <div className="flex justify-center animate-fade-in">
               <div className="bg-slate-900 border border-slate-800 p-4 rounded-full flex items-center gap-6 px-8">
                  <button onClick={() => playAudio(currentAudioData)} className="w-12 h-12 rounded-full bg-cyan-500 flex items-center justify-center text-white shadow-[0_0_15px_rgba(6,182,212,0.5)] hover:scale-105 transition-all"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
                  <div className="flex flex-col"><span className="text-[10px] text-slate-500 font-mono uppercase">Master Output Ready</span><span className="text-xs text-white font-mono">{(currentAudioData.length / 24000).toFixed(1)} Seconds Generated</span></div>
                  <a href={downloadUrl} download={`${projectName.replace(/\s+/g, '_')}.wav`} className="text-cyan-400 hover:text-white p-2 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></a>
               </div>
            </div>
          )}
       </div>
    </div>
  );
};
