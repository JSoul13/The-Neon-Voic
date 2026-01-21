import React from 'react';
import { VoiceOption } from '../types';

interface VoiceSelectorProps {
  voices: VoiceOption[];
  selectedVoiceId: string;
  onSelect: (id: string) => void;
  onEdit: (voice: VoiceOption) => void;
  onCreate: () => void;
  onClone: () => void;
  onPreview: (voice: VoiceOption) => void;
  previewingVoiceId: string | null;
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({ 
  voices, 
  selectedVoiceId, 
  onSelect, 
  onEdit,
  onCreate,
  onClone,
  onPreview,
  previewingVoiceId
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {/* Create New Card */}
      <div 
        onClick={onCreate}
        className="relative cursor-pointer group min-h-[160px] flex items-center justify-center border-2 border-dashed border-slate-700 rounded-lg hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all"
      >
         <div className="flex flex-col items-center text-slate-500 group-hover:text-cyan-400 transition-colors">
            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            <span className="font-mono text-sm uppercase tracking-wider">Create Custom</span>
         </div>
      </div>

      {/* Clone Voice Card */}
      <div 
        onClick={onClone}
        className="relative cursor-pointer group min-h-[160px] flex items-center justify-center border-2 border-dashed border-slate-700 rounded-lg hover:border-pink-500/50 hover:bg-pink-500/5 transition-all"
      >
         <div className="flex flex-col items-center text-slate-500 group-hover:text-pink-400 transition-colors">
            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            <span className="font-mono text-sm uppercase tracking-wider">Clone Voice</span>
         </div>
         <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] border border-pink-500/30 text-pink-500 bg-pink-900/20 font-mono uppercase">
           Beta
         </div>
      </div>

      {voices.map((voice) => {
        const isSelected = selectedVoiceId === voice.id;
        const isClone = voice.id.startsWith('cloned-') || voice.id.startsWith('custom-');
        const isPreviewing = previewingVoiceId === voice.id;

        return (
          <div
            key={voice.id}
            onClick={() => onSelect(voice.id)}
            className={`
              relative cursor-pointer group transition-all duration-300 transform
              ${isSelected ? 'scale-105 z-10' : 'hover:scale-102'}
            `}
          >
            {/* Holographic Glow */}
            <div className={`absolute -inset-0.5 bg-gradient-to-r ${voice.color} rounded-lg blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 ${isSelected ? 'opacity-70' : ''}`}></div>
            
            <div className="relative bg-slate-900 border border-slate-700/50 rounded-lg p-6 h-full flex flex-col items-start backdrop-blur-sm">
               <div className="flex justify-between w-full items-center mb-2 pr-8">
                 <h3 className="font-mono text-xl font-bold text-white uppercase tracking-wider truncate mr-2">{voice.name}</h3>
                 <span className={`text-[10px] px-2 py-1 rounded border uppercase ${isSelected ? 'border-cyan-400 text-cyan-400' : 'border-slate-600 text-slate-400'}`}>
                   {voice.gender}
                 </span>
               </div>
               
               <p className="text-slate-400 text-xs mb-4 font-sans leading-relaxed line-clamp-3">
                 {voice.description}
               </p>

               {/* Play Preview Button */}
               <button
                 onClick={(e) => { e.stopPropagation(); onPreview(voice); }}
                 disabled={isPreviewing}
                 className={`absolute top-2 right-2 p-2 rounded-full border transition-all z-20 
                   ${isPreviewing 
                      ? 'border-cyan-500 text-cyan-400 bg-cyan-900/20' 
                      : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-white hover:border-cyan-500 hover:bg-slate-700'
                   }
                 `}
                 title="Preview Voice"
               >
                 {isPreviewing ? (
                   <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                 ) : (
                   <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                 )}
               </button>
               
               {/* Edit Button - Always visible for clones, hover for default */}
               <button 
                 onClick={(e) => { e.stopPropagation(); onEdit(voice); }}
                 className={`absolute bottom-2 right-2 p-2 rounded-full border transition-all ${isClone ? 'border-slate-600 text-slate-300 hover:text-white bg-slate-800' : 'border-transparent text-slate-500 hover:text-cyan-400 opacity-0 group-hover:opacity-100'}`}
                 title="Customize Voice"
               >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
               </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};