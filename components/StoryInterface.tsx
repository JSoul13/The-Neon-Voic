
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { AgentPersona, Project, VoiceOption, CastMember } from '../types';
import { base64ToUint8Array, pcmToWav } from '../utils/audio';
import { saveProject, getCustomVoices } from '../utils/db';
import { Visualizer } from './Visualizer';
import { DEFAULT_VOICES } from '../constants';

interface StoryInterfaceProps {
  agent: AgentPersona;
  initialProject?: Project; 
  userId?: string;
  onExit: () => void;
}

interface ScriptTurn {
  voiceId: string;
  text: string;
}

export const StoryInterface: React.FC<StoryInterfaceProps> = ({ agent, initialProject, userId, onExit }) => {
  const [projectId] = useState(initialProject?.id || crypto.randomUUID());
  const [projectName, setProjectName] = useState(initialProject?.name || 'Untitled Project');
  const [text, setText] = useState(initialProject?.text || '');
  const [currentAudioData, setCurrentAudioData] = useState<Int16Array | null>(initialProject?.audioData || null);
  const [duration, setDuration] = useState(initialProject?.duration || 0);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [voiceVolume, setVoiceVolume] = useState(initialProject ? initialProject.voiceVolume : 1.0);
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>(DEFAULT_VOICES);
  
  // Cast Management: Default to Narrator using the Agent's primary voice
  const [cast, setCast] = useState<CastMember[]>(initialProject?.cast || [
    { id: crypto.randomUUID(), name: 'Narrator', voiceId: DEFAULT_VOICES.find(v => v.apiId === agent.voice)?.id || DEFAULT_VOICES[0].id }
  ]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const savedOffsetRef = useRef<number>(0);
  const isManualStopRef = useRef<boolean>(false);

  // Load available voices including custom ones
  useEffect(() => {
    const loadVoices = async () => {
      const custom = await getCustomVoices();
      const merged = [...DEFAULT_VOICES];
      custom.forEach(cv => {
        if (!merged.find(mv => mv.id === cv.id)) merged.push(cv);
      });
      setAvailableVoices(merged);
    };
    loadVoices();
  }, []);

  // Sync Cast Member Names (Single character = Narrator)
  useEffect(() => {
    if (cast.length === 1 && cast[0].name !== 'Narrator') {
      const newCast = [...cast];
      newCast[0].name = 'Narrator';
      setCast(newCast);
    }
  }, [cast.length]);

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

  useEffect(() => {
    return () => {
      stopPlayback(true);
      if (audioContextRef.current) audioContextRef.current.close();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const handleAddCharacter = () => {
    if (cast.length >= 4) return;
    const newChar: CastMember = {
      id: crypto.randomUUID(),
      name: `Character ${cast.length + 1}`,
      voiceId: availableVoices[0].id
    };
    setCast([...cast, newChar]);
  };

  const handleDeleteCharacter = (id: string) => {
    if (cast.length <= 1) return;
    setCast(cast.filter(c => c.id !== id));
  };

  const updateCharacter = (id: string, updates: Partial<CastMember>) => {
    setCast(cast.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setIsLoading(true);
    stopPlayback(true); 

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const turns: ScriptTurn[] = [];
      const lines = text.split('\n');
      
      lines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        let foundMatch = false;
        for (const member of cast) {
          // Case insensitive match with flexible spacing
          const regex = new RegExp(`^${member.name}\\s*:\\s*(.*)`, 'i');
          const match = trimmedLine.match(regex);
          if (match) {
            turns.push({ 
              voiceId: member.voiceId, 
              text: match[1].trim() 
            });
            foundMatch = true;
            break;
          }
        }

        if (!foundMatch) {
          // Narrative line, use the first character (usually Narrator)
          turns.push({ 
            voiceId: cast[0].voiceId, 
            text: trimmedLine 
          });
        }
      });

      const allPcmParts: Int16Array[] = [];

      for (const turn of turns) {
        if (!turn.text) continue;

        const voiceOption = availableVoices.find(v => v.id === turn.voiceId) || availableVoices[0];

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: turn.text }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceOption.apiId as any },
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          const uint8Array = base64ToUint8Array(base64Audio);
          const pcmPart = new Int16Array(uint8Array.buffer);
          allPcmParts.push(pcmPart);
        }
        
        await new Promise(r => setTimeout(r, 600)); // Delay to mitigate 429
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
        const newDuration = mergedPcm.length / 24000;
        setDuration(newDuration);
        await saveToDB(mergedPcm, newDuration);
        playAudioData(mergedPcm, 0);
      }
    } catch (error: any) {
      console.error("Story Generation failed", error);
      alert("Neural synthesis encountered an issue. Check your connection or retry in a moment.");
    } finally {
      setIsLoading(false);
    }
  };

  const saveToDB = useCallback(async (audio: Int16Array | null, dur: number) => {
      if (!userId) return;
      setIsSaving(true);
      const projectData: Project = {
          id: projectId,
          userId: userId,
          name: projectName,
          createdAt: initialProject ? initialProject.createdAt : Date.now(),
          updatedAt: Date.now(),
          agent: agent,
          text: text,
          audioData: audio,
          duration: dur,
          voiceVolume: voiceVolume,
          cast: cast
      };
      try {
          await saveProject(projectData);
          setLastSaved(Date.now());
      } catch (e) {
          console.error("Auto save failed", e);
      } finally {
          setIsSaving(false);
      }
  }, [userId, projectId, projectName, initialProject, agent, text, voiceVolume, cast]);

  const stopPlayback = (reset = true) => {
    if (voiceSourceRef.current) {
      isManualStopRef.current = true;
      try { voiceSourceRef.current.stop(); voiceSourceRef.current.disconnect(); } catch (e) {}
      voiceSourceRef.current = null;
    }
    setIsPlaying(false);
    if (reset) {
        setIsPaused(false);
        savedOffsetRef.current = 0;
    }
  };

  const pausePlayback = () => {
     if (!isPlaying || !voiceSourceRef.current || !audioContextRef.current) return;
     const playbackRate = voiceSourceRef.current.playbackRate.value || 1;
     const elapsed = (audioContextRef.current.currentTime - startTimeRef.current) * playbackRate;
     savedOffsetRef.current += elapsed;
     stopPlayback(false); 
     setIsPaused(true);
  };

  const playAudioData = async (rawPcmData: Int16Array | null, offset = 0) => {
    if (!rawPcmData) return;
    if (voiceSourceRef.current) stopPlayback(false); 
    isManualStopRef.current = false;
    
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    const buffer = ctx.createBuffer(1, rawPcmData.length, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < rawPcmData.length; i++) channelData[i] = rawPcmData[i] / 32768.0;
    
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    
    const gainNode = ctx.createGain();
    gainNode.gain.value = voiceVolume;
    voiceGainRef.current = gainNode;
    
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    
    source.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(ctx.destination);
    
    source.onended = () => {
        if (!isManualStopRef.current) {
            setIsPlaying(false);
            setIsPaused(false);
            savedOffsetRef.current = 0;
        }
    };
    source.start(0, offset);
    startTimeRef.current = ctx.currentTime;
    voiceSourceRef.current = source;
    setIsPlaying(true);
    setIsPaused(false);
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
    } else {
      setVolumeLevel(0);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isPlaying]);

  return (
    <div className="relative w-full min-h-screen flex flex-col items-center p-6 bg-slate-950 overflow-y-auto custom-scrollbar">
       <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-black pointer-events-none"></div>
       <div className="relative z-10 w-full max-w-6xl flex flex-col gap-6">
          
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-900/50 backdrop-blur-md p-4 rounded-xl border border-slate-800">
             <div className="flex items-center gap-4">
               <button onClick={onExit} className="text-slate-400 hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
               </button>
               <div>
                  <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} className="bg-transparent text-xl font-mono font-bold text-white tracking-widest focus:outline-none focus:border-b border-cyan-500 w-full md:w-64" placeholder="Project Name" />
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${agent.avatarColor}`}></div>
                    <span className="text-xs text-slate-400 uppercase">Host Agent: {agent.name}</span>
                    <span className="text-xs text-slate-600">|</span>
                    <span className="text-xs text-slate-500">{isSaving ? "Saving..." : (lastSaved ? `Saved ${new Date(lastSaved).toLocaleTimeString()}` : "Unsaved")}</span>
                  </div>
               </div>
             </div>
             <button onClick={onExit} className="text-slate-400 hover:text-white font-mono text-xs border border-slate-700 px-4 py-2 rounded hover:bg-slate-800 transition-all">CLOSE STORY MODE</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
             {/* Left: Script Editor */}
             <div className="lg:col-span-3 space-y-4">
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-1 relative group h-full flex flex-col min-h-[500px]">
                   <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/60 rounded-t-lg">
                      <span className="text-cyan-400 font-mono text-xs uppercase tracking-widest flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg> Script Editor
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono italic">Start lines with 'Name:' to switch character voices</span>
                   </div>
                   <textarea 
                     value={text} 
                     onChange={(e) => setText(e.target.value)} 
                     placeholder={`Narrator: Once upon a time...\n${cast[1]?.name || 'Character'}: "I have a message for the realm."`} 
                     className="relative flex-1 bg-slate-950 rounded-b-lg p-6 text-slate-200 font-sans text-xl leading-relaxed focus:outline-none resize-none custom-scrollbar selection:bg-cyan-500/30" 
                   />
                   <div className="absolute bottom-4 right-4 text-xs text-slate-500 font-mono bg-slate-950/80 px-2 py-1 rounded border border-slate-800">{text.length} CHARS</div>
                </div>
             </div>

             {/* Right: Cast Management */}
             <div className="space-y-6">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 h-full flex flex-col shadow-lg backdrop-blur-sm">
                   <div className="flex justify-between items-center mb-6">
                     <h3 className="text-cyan-400 font-mono text-xs uppercase tracking-widest flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> Character Cast
                     </h3>
                     {cast.length < 4 && (
                        <button 
                          onClick={handleAddCharacter} 
                          className="flex items-center gap-2 px-3 py-1 bg-cyan-600/20 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-600/40 rounded transition-all font-mono text-[10px] uppercase" 
                          title="Add Character"
                        >
                           <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                           Add
                        </button>
                     )}
                   </div>

                   <div className="space-y-4 flex-1 overflow-y-auto pr-2 custom-scrollbar max-h-[600px]">
                      {cast.map((member, index) => (
                        <div key={member.id} className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3 relative group animate-fade-in shadow-inner">
                           {cast.length > 1 && (
                             <button onClick={() => handleDeleteCharacter(member.id)} className="absolute top-2 right-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1" title="Remove Character">
                               <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                             </button>
                           )}
                           <div className="space-y-1">
                              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-tighter">Script Name</label>
                              <input 
                                value={member.name} 
                                readOnly={cast.length === 1}
                                onChange={(e) => updateCharacter(member.id, { name: e.target.value })}
                                className={`w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white font-mono focus:border-cyan-500 outline-none transition-colors ${cast.length === 1 ? 'opacity-70 cursor-not-allowed' : ''}`}
                                placeholder="Enter Name"
                              />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] text-slate-500 font-mono uppercase tracking-tighter">Voice Profile</label>
                              <select 
                                value={member.voiceId} 
                                onChange={(e) => updateCharacter(member.id, { voiceId: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-800 text-[10px] text-slate-400 p-1.5 rounded font-mono focus:outline-none focus:border-cyan-500 transition-colors"
                              >
                                {availableVoices.map(v => (
                                  <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                              </select>
                           </div>
                           <div className={`h-1 w-full bg-gradient-to-r ${availableVoices.find(v => v.id === member.voiceId)?.color || 'from-slate-700 to-slate-800'} rounded-full opacity-60 shadow-[0_0_10px_rgba(0,0,0,0.5)]`}></div>
                        </div>
                      ))}
                   </div>
                   
                   <div className="mt-4 pt-4 border-t border-slate-800">
                      <div className="flex items-center gap-4 bg-slate-950 px-4 py-3 rounded-xl border border-slate-800 shadow-inner">
                        <span className="text-[10px] text-slate-500 font-mono uppercase w-20">Master Vol</span>
                        <input type="range" min="0" max="1" step="0.05" value={voiceVolume} onChange={(e) => setVoiceVolume(Number(e.target.value))} className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                      </div>
                   </div>
                </div>
             </div>
          </div>

          <div className="flex justify-center gap-4 pt-4">
             <button 
               onClick={handleGenerate} 
               disabled={isLoading || !text} 
               className={`relative px-16 py-6 bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(6,182,212,0.4)] group overflow-hidden transform hover:scale-[1.02] active:scale-[0.98]`}
             >
               {isLoading ? (
                 <span className="flex items-center gap-3"><svg className="animate-spin h-6 w-6" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> SYNTHESIZING PERFORMANCE...</span>
               ) : (
                 <span className="flex items-center gap-3 text-lg"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg> PRODUCE STORY</span>
               )}
             </button>
          </div>

          {currentAudioData && (
             <div className="bg-slate-900/80 border border-cyan-500/30 rounded-3xl p-8 animate-fade-in backdrop-blur-xl shadow-[0_0_60px_rgba(0,0,0,0.6)]">
                <div className="flex flex-col md:flex-row items-center gap-10">
                   <div className="flex items-center gap-4 bg-slate-950 p-4 rounded-3xl border border-slate-800 shadow-xl">
                       <button onClick={() => playAudioData(currentAudioData, savedOffsetRef.current)} disabled={isPlaying} className={`w-16 h-16 rounded-full border flex items-center justify-center transition-all ${isPlaying ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed' : 'bg-cyan-500/20 border-cyan-400 text-cyan-300 hover:bg-cyan-500/30 shadow-[0_0_20px_#22d3ee]'}`}><svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
                       <button onClick={pausePlayback} disabled={!isPlaying} className={`w-14 h-14 rounded-full border flex items-center justify-center transition-all ${!isPlaying ? 'bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed' : 'bg-amber-500/20 border-amber-500 text-amber-400 hover:bg-amber-500/30'}`}><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg></button>
                       <button onClick={() => stopPlayback(true)} className={`w-14 h-14 rounded-full border flex items-center justify-center transition-all bg-red-500/20 border-red-500 text-red-400 hover:bg-red-500/30`}><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg></button>
                   </div>
                   <div className="flex flex-col flex-1 w-full gap-4">
                     <div className="h-24 w-full bg-slate-950/90 rounded-2xl overflow-hidden relative border border-slate-800 shadow-inner"><div className="absolute inset-0 flex items-center justify-center pointer-events-none"><Visualizer level={volumeLevel} color={isPlaying ? "#00f3ff" : "#334155"} isActive={isPlaying} /></div></div>
                     <div className="flex justify-between items-center px-4">
                        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Master Voice Output Channel</span>
                        <span className="text-xs text-cyan-500 font-mono">{(currentAudioData.length / 24000).toFixed(1)}S</span>
                     </div>
                   </div>
                   <a 
                     href={downloadUrl} 
                     download={`${(projectName || 'untitled').replace(/\s+/g, '_')}.wav`} 
                     className="flex-shrink-0 px-10 py-5 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-cyan-500 text-white rounded-2xl font-mono text-sm uppercase tracking-widest flex items-center gap-3 transition-all shadow-xl transform hover:translate-y-[-2px] active:translate-y-[0px]"
                   >
                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> 
                     Export WAV
                   </a>
                </div>
             </div>
          )}
       </div>
    </div>
  );
}
