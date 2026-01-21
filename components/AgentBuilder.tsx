
import React, { useState, useRef, useEffect } from 'react';
import { VoiceSelector } from './VoiceSelector';
import { AgentPersona, VoiceOption, VoiceName, Gender } from '../types';
import { DEFAULT_INSTRUCTION, DEFAULT_VOICES } from '../constants';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { blobToBase64, decodeAudioData } from '../utils/audio';
import { saveCustomVoice, getCustomVoices, deleteCustomVoice } from '../utils/db';

interface AgentBuilderProps {
  onComplete: (agent: AgentPersona, mode: 'LIVE' | 'TTS' | 'PODCAST') => void;
}

const COLORS = [
  { label: 'Blood Red', value: 'from-red-900 to-slate-900' },
  { label: 'Ecto Blue', value: 'from-slate-400 to-indigo-300' },
  { label: 'Cyan/Blue', value: 'from-cyan-400 to-blue-500' },
  { label: 'Pink/Purple', value: 'from-pink-500 to-purple-500' },
  { label: 'Red/Orange', value: 'from-red-500 to-orange-600' },
  { label: 'Emerald/Teal', value: 'from-emerald-400 to-teal-500' },
  { label: 'Violet/Indigo', value: 'from-violet-500 to-indigo-600' },
  { label: 'Yellow/Amber', value: 'from-yellow-400 to-amber-500' },
];

export const AgentBuilder: React.FC<AgentBuilderProps> = ({ onComplete }) => {
  const [name, setName] = useState('Nexus-7');
  const [instruction, setInstruction] = useState(DEFAULT_INSTRUCTION);
  
  const [voices, setVoices] = useState<VoiceOption[]>(DEFAULT_VOICES);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(DEFAULT_VOICES[0].id);
  
  const [showVoiceVault, setShowVoiceVault] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingVoice, setEditingVoice] = useState<VoiceOption | null>(null);

  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formGender, setFormGender] = useState<Gender>(Gender.Neutral);
  const [formBaseVoice, setFormBaseVoice] = useState<string>(VoiceName.Kore);
  const [formColor, setFormColor] = useState(COLORS[0].value);
  const [formSpeed, setFormSpeed] = useState(1.0);
  const [formPitch, setFormPitch] = useState(0);

  const [isCloningOpen, setIsCloningOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Load custom voices from DB on mount
  useEffect(() => {
    const loadSavedVoices = async () => {
      const saved = await getCustomVoices();
      if (saved.length > 0) {
        setVoices(prev => {
          // Merge defaults with saved, avoiding duplicates by ID
          const defaultsOnly = DEFAULT_VOICES.filter(dv => !saved.find(sv => sv.id === dv.id));
          return [...defaultsOnly, ...saved];
        });
      }
    };
    loadSavedVoices();
  }, []);

  const handleStart = (mode: 'LIVE' | 'TTS' | 'PODCAST') => {
    const selectedVoiceDetails = voices.find(v => v.id === selectedVoiceId);
    if (!selectedVoiceDetails) return;

    onComplete({
      id: crypto.randomUUID(),
      name,
      voice: selectedVoiceDetails.apiId,
      voiceSettings: {
        speed: selectedVoiceDetails.speed,
        pitch: selectedVoiceDetails.pitch
      },
      systemInstruction: instruction,
      avatarColor: selectedVoiceDetails.color
    }, mode);
  };

  const openCreateModal = () => {
    setEditingVoice(null);
    setFormName('New Personality Module');
    setFormDesc('Custom character protocol.');
    setFormGender(Gender.Neutral);
    setFormBaseVoice(VoiceName.Kore);
    setFormColor(COLORS[2].value);
    setFormSpeed(1.0);
    setFormPitch(0);
    setIsEditorOpen(true);
  };

  const openEditModal = (voice: VoiceOption) => {
    setEditingVoice(voice);
    setFormName(voice.name);
    setFormDesc(voice.description);
    setFormGender(voice.gender);
    setFormBaseVoice(voice.apiId);
    setFormColor(voice.color);
    setFormSpeed(voice.speed);
    setFormPitch(voice.pitch);
    setIsEditorOpen(true);
  };

  const handleSaveVoice = async () => {
    const newVoice: VoiceOption = {
      id: editingVoice ? editingVoice.id : crypto.randomUUID(),
      apiId: formBaseVoice,
      name: formName,
      description: formDesc,
      gender: formGender,
      color: formColor,
      speed: formSpeed,
      pitch: formPitch,
      isCustom: true
    };

    await saveCustomVoice(newVoice);

    setVoices(prev => {
      const filtered = prev.filter(v => v.id !== newVoice.id);
      return [...filtered, newVoice];
    });
    setSelectedVoiceId(newVoice.id);
    setIsEditorOpen(false);
  };

  const handleDeleteVoice = async (id: string) => {
    if (confirm("Delete this personality from your vault?")) {
      await deleteCustomVoice(id);
      setVoices(prev => prev.filter(v => v.id !== id));
      if (selectedVoiceId === id) setSelectedVoiceId(DEFAULT_VOICES[0].id);
    }
  };

  const handlePreviewVoice = async (voice: VoiceOption) => {
    if (previewingVoiceId) return; // Prevent concurrent previews
    setPreviewingVoiceId(voice.id);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const text = `Greetings. I am ${voice.name}. Protocol initialized.`;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice.apiId },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const buffer = await decodeAudioData(base64Audio, ctx);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.playbackRate.value = voice.speed;
          source.detune.value = voice.pitch;
          source.connect(ctx.destination);
          source.start();
      }

    } catch (e: any) {
      console.error("Preview failed", e);
      if (e.message?.includes("429") || e.status === 429) {
          alert("Neural Link Throttled (Quota Exceeded). Please wait 30 seconds before another preview.");
      } else {
          alert("Synthesis interface failure. Check neural connection.");
      }
    } finally {
      // Cooldown to prevent spamming
      setTimeout(() => setPreviewingVoiceId(null), 1500);
    }
  };

  const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        chunksRef.current = [];
        mediaRecorderRef.current.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        mediaRecorderRef.current.start();
        setIsRecording(true);
    } catch (e) {
        console.error("Mic access denied", e);
    }
  };

  const stopRecordingAndAnalyze = async () => {
      if (!mediaRecorderRef.current) return;
      return new Promise<void>((resolve) => {
          mediaRecorderRef.current!.onstop = async () => {
             const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
             await analyzeVoice(blob);
             resolve();
          };
          mediaRecorderRef.current!.stop();
          mediaRecorderRef.current!.stream.getTracks().forEach(t => t.stop());
          setIsRecording(false);
      });
  };

  const analyzeVoice = async (audioBlob: Blob) => {
      setIsAnalyzing(true);
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const base64Audio = await blobToBase64(audioBlob);
          const prompt = `Analyze this voice sample for pitch, speed, and gender. Map it to one of the Gemini prebuilt voices (Puck, Charon, Kore, Fenrir, Zephyr). Return only JSON.`;
          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: {
                  parts: [
                      { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
                      { text: prompt }
                  ]
              },
              config: {
                  responseMimeType: 'application/json',
                  responseSchema: {
                      type: Type.OBJECT,
                      properties: {
                          suggestedName: { type: Type.STRING },
                          baseVoice: { type: Type.STRING, enum: [VoiceName.Puck, VoiceName.Charon, VoiceName.Kore, VoiceName.Fenrir, VoiceName.Zephyr] },
                          speed: { type: Type.NUMBER },
                          pitch: { type: Type.NUMBER },
                          description: { type: Type.STRING },
                          systemInstruction: { type: Type.STRING },
                          gender: { type: Type.STRING, enum: [Gender.Male, Gender.Female, Gender.Neutral] }
                      }
                  }
              }
          });
          const result = JSON.parse(response.text);
          const clonedVoice: VoiceOption = {
              id: `cloned-${Date.now()}`,
              apiId: result.baseVoice,
              name: `${result.suggestedName} (Clone)`,
              description: result.description,
              gender: result.gender,
              color: 'from-pink-500 to-cyan-500', 
              speed: result.speed,
              pitch: result.pitch,
              isCustom: true
          };
          
          await saveCustomVoice(clonedVoice);
          setVoices(prev => [...prev, clonedVoice]);
          setSelectedVoiceId(clonedVoice.id);
          setName(`${result.suggestedName} Agent`);
          setInstruction(result.systemInstruction);
          setIsCloningOpen(false);
      } catch (e) {
          console.error("Analysis failed", e);
          alert("Failed to analyze voice sample.");
      } finally {
          setIsAnalyzing(false);
      }
  };

  const customSavedVoices = voices.filter(v => v.isCustom);

  return (
    <div className="w-full max-w-6xl mx-auto p-6 animate-fade-in">
       <header className="mb-8 text-center relative">
         <h1 className="text-4xl md:text-6xl font-mono font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 mb-2 drop-shadow-[0_0_10px_rgba(0,243,255,0.3)]">
           VOICE AGENT PROTOCOL
         </h1>
         <p className="text-slate-400 text-lg font-sans tracking-wide">
           INITIALIZE YOUR PERSONAL HOLOGRAPHIC ASSISTANT
         </p>
         <button 
           onClick={() => setShowVoiceVault(!showVoiceVault)}
           className="absolute top-0 right-0 md:top-4 md:right-4 border border-cyan-500/50 text-cyan-400 px-4 py-2 rounded hover:bg-cyan-500/10 transition-all font-mono text-xs flex items-center gap-2"
         >
           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
           {showVoiceVault ? 'HIDE VAULT' : 'MY VAULT'}
         </button>
       </header>

       {showVoiceVault && (
         <div className="mb-8 bg-slate-900/80 border border-slate-700 p-6 rounded-xl animate-fade-in shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <h3 className="text-cyan-400 font-mono mb-4 text-sm uppercase flex items-center gap-2">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
               Saved Custom Personas
            </h3>
            {customSavedVoices.length === 0 ? (
                <p className="text-slate-500 text-sm italic py-4">You haven't saved any custom characters yet. Use "Create Custom" or "Clone Voice" to start your library.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {customSavedVoices.map(voice => (
                        <div key={voice.id} onClick={() => { setSelectedVoiceId(voice.id); setShowVoiceVault(false); }} className={`p-4 border bg-slate-950 rounded cursor-pointer transition-all relative group overflow-hidden ${selectedVoiceId === voice.id ? 'border-cyan-500 shadow-[0_0_15px_rgba(34,211,238,0.2)]' : 'border-slate-800 hover:border-slate-600'}`}>
                            <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${voice.color}`}></div>
                            <div className="font-bold text-white pl-2">{voice.name}</div>
                            <div className="text-[10px] text-slate-500 mt-1 pl-2 font-mono uppercase">{voice.apiId} BASE</div>
                             <div className="absolute top-2 right-2 flex gap-2">
                                <button onClick={(e) => { e.stopPropagation(); openEditModal(voice); }} className="p-1 text-slate-500 hover:text-cyan-400 transition-colors">
                                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteVoice(voice.id); }} className="p-1 text-slate-500 hover:text-red-400 transition-colors">
                                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                             </div>
                        </div>
                    ))}
                </div>
            )}
         </div>
       )}

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         <div className="space-y-6">
           <div className="bg-slate-900/60 backdrop-blur-md border border-slate-700/50 p-6 rounded-xl relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500 shadow-[0_0_15px_#22d3ee]"></div>
              <div className="mb-6">
                <label className="block text-cyan-400 font-mono text-sm mb-2 uppercase tracking-wider">Agent Designation (Name)</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all font-mono" placeholder="ENTER NAME" />
              </div>
              <div className="mb-6">
                <label className="block text-cyan-400 font-mono text-sm mb-2 uppercase tracking-wider">System Protocol (Instructions)</label>
                <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-3 text-white h-32 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all font-sans text-sm resize-none" placeholder="Define behavior..." />
              </div>
           </div>
           
           <div className="grid grid-cols-3 gap-4">
             <button onClick={() => handleStart('LIVE')} className="py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-bold text-xs md:text-sm rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.3)] transform hover:scale-[1.02] transition-all border border-cyan-400/30">
               LIVE LINK
             </button>
             <button onClick={() => handleStart('TTS')} className="py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-mono font-bold text-xs md:text-sm rounded-lg shadow-[0_0_20px_rgba(192,38,211,0.3)] transform hover:scale-[1.02] transition-all border border-purple-400/30">
               STORY MODE
             </button>
             <button onClick={() => handleStart('PODCAST')} className="py-4 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-mono font-bold text-xs md:text-sm rounded-lg shadow-[0_0_20px_rgba(245,158,11,0.3)] transform hover:scale-[1.02] transition-all border border-orange-400/30">
               PODCAST LAB
             </button>
           </div>
         </div>

         <div className="bg-slate-900/30 rounded-xl border border-slate-800 p-4 flex flex-col h-full">
            <div className="flex justify-between items-center mb-4 px-2">
                 <h2 className="text-cyan-400 font-mono text-sm uppercase tracking-wider">Select Voice Module</h2>
                 <div className="flex gap-2">
                    <button onClick={() => setShowVoiceVault(true)} className="p-2 border border-slate-600 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-400 transition-colors" title="Open Vault"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg></button>
                 </div>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-[400px]">
              <VoiceSelector voices={voices} selectedVoiceId={selectedVoiceId} onSelect={setSelectedVoiceId} onCreate={openCreateModal} onClone={() => setIsCloningOpen(true)} onEdit={openEditModal} onPreview={handlePreviewVoice} previewingVoiceId={previewingVoiceId} />
            </div>
         </div>
       </div>

       {isEditorOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-cyan-500/50 rounded-xl w-full max-w-lg p-6 shadow-[0_0_50px_rgba(0,243,255,0.1)] relative max-h-[90vh] overflow-y-auto custom-scrollbar">
               <h3 className="text-xl font-mono text-white mb-6 border-b border-slate-700 pb-2">{editingVoice ? 'RECALIBRATE VOICE MODULE' : 'INITIALIZE NEW VOICE'}</h3>
               <div className="space-y-4">
                  <div><label className="block text-xs text-slate-400 mb-1 font-mono">MODULE NAME</label><input className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white font-mono focus:border-cyan-500 outline-none" value={formName} onChange={e => setFormName(e.target.value)} /></div>
                  <div><label className="block text-xs text-slate-400 mb-1 font-mono">DESCRIPTION</label><textarea className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm focus:border-cyan-500 outline-none h-16 resize-none" value={formDesc} onChange={e => setFormDesc(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs text-slate-400 mb-1 font-mono">BASE TONE (API)</label><select className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm focus:border-cyan-500 outline-none" value={formBaseVoice} onChange={e => setFormBaseVoice(e.target.value)}>{Object.values(VoiceName).map(v => <option key={v} value={v}>{v}</option>)}</select></div>
                    <div><label className="block text-xs text-slate-400 mb-1 font-mono">GENDER IDENTITY</label><select className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm focus:border-cyan-500 outline-none" value={formGender} onChange={e => setFormGender(e.target.value as Gender)}>{Object.values(Gender).map(g => <option key={g} value={g}>{g}</option>)}</select></div>
                  </div>
                  <div><label className="block text-xs text-slate-400 mb-2 font-mono">COLOR THEME</label>
                    <div className="grid grid-cols-4 gap-2">
                      {COLORS.map(c => (
                        <button key={c.value} onClick={() => setFormColor(c.value)} className={`h-8 rounded-lg bg-gradient-to-r ${c.value} border-2 ${formColor === c.value ? 'border-white' : 'border-transparent'}`} title={c.label} />
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-950/50 p-4 rounded border border-slate-800">
                    <label className="block text-cyan-400 text-xs font-mono mb-3 uppercase border-b border-slate-800 pb-1">Audio Parameters</label>
                    <div className="mb-4">
                      <div className="flex justify-between text-xs text-slate-400 mb-1"><span>PITCH (Detune)</span><span className="text-cyan-400">{formPitch} cents</span></div>
                      <input type="range" min="-1200" max="1200" step="50" value={formPitch} onChange={(e) => setFormPitch(Number(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-400 mb-1"><span>SPEED (Rate)</span><span className="text-cyan-400">{formSpeed}x</span></div>
                      <input type="range" min="0.5" max="2.0" step="0.1" value={formSpeed} onChange={(e) => setFormSpeed(Number(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                    </div>
                  </div>
               </div>
               <div className="flex justify-end gap-3 mt-8">
                  <button onClick={() => setIsEditorOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white font-mono text-sm">CANCEL</button>
                  <button onClick={handleSaveVoice} className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-mono rounded shadow-[0_0_15px_rgba(6,182,212,0.4)]">SAVE TO VAULT</button>
               </div>
            </div>
         </div>
       )}

       {isCloningOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <div className="bg-slate-900 border border-pink-500/50 rounded-xl w-full max-w-lg p-8 shadow-[0_0_80px_rgba(236,72,153,0.15)] relative flex flex-col items-center">
               <h3 className="text-2xl font-mono font-bold text-white mb-2 text-center">BIOMETRIC VOICE CLONING</h3>
               <p className="text-slate-400 text-center text-sm mb-8">Record a sample to synthesize a matching persona.</p>
               <div className={`relative w-40 h-40 flex items-center justify-center mb-8 rounded-full border-2 ${isRecording ? 'border-pink-500 animate-pulse' : 'border-slate-700'}`}>
                  {isAnalyzing ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center"><div className="w-12 h-12 border-4 border-t-pink-500 border-r-transparent border-b-pink-500 border-l-transparent rounded-full animate-spin mb-2"></div><span className="text-xs text-pink-400 font-mono animate-pulse">ANALYZING DNA</span></div>
                  ) : (
                    <svg className={`w-16 h-16 text-slate-500 ${isRecording ? 'text-pink-500 animate-bounce' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  )}
               </div>
               <div className="flex gap-4">
                  <button onClick={() => setIsCloningOpen(false)} className="px-6 py-3 border border-slate-700 text-slate-300 rounded hover:bg-slate-800 transition-colors font-mono uppercase text-xs" disabled={isRecording || isAnalyzing}>Abort</button>
                  {!isRecording ? (<button onClick={startRecording} disabled={isAnalyzing} className="px-8 py-3 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded shadow-[0_0_20px_rgba(219,39,119,0.4)] transition-all font-mono uppercase text-xs">Start Recording</button>) : (<button onClick={stopRecordingAndAnalyze} className="px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-[0_0_20px_rgba(220,38,38,0.4)] animate-pulse transition-all font-mono uppercase text-xs">Stop & Analyze</button>)}
               </div>
            </div>
         </div>
       )}
    </div>
  );
};
