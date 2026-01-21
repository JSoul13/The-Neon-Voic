
import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPcmBlob, decodeAudioData } from '../utils/audio';
import { AgentPersona } from '../types';

interface UseLiveAgentProps {
  agent: AgentPersona;
}

export const useLiveAgent = ({ agent }: UseLiveAgentProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // Model is speaking
  const [isListening, setIsListening] = useState(false); // Mic is active
  const [volumeLevels, setVolumeLevels] = useState<{ input: number; output: number }>({ input: 0, output: 0 });
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  
  // Animation frame loop for volume meter
  const volumeIntervalRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (sessionRef.current) {
      sessionRef.current = null;
    }
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    
    setIsConnected(false);
    setIsListening(false);
    setIsSpeaking(false);
    setVolumeLevels({ input: 0, output: 0 });
  }, []);

  const connect = async () => {
    try {
      setError(null);
      
      // Initialize Audio Contexts
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      
      // Setup Analysers
      outputAnalyserRef.current = audioContextRef.current.createAnalyser();
      outputAnalyserRef.current.fftSize = 256;
      inputAnalyserRef.current = inputContextRef.current.createAnalyser();
      inputAnalyserRef.current.fftSize = 256;

      const outputNode = audioContextRef.current.createGain();
      outputNode.connect(outputAnalyserRef.current);
      outputAnalyserRef.current.connect(audioContextRef.current.destination);

      // Start Microphone
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Initialize Gemini Client
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log("Session Opened");
            setIsConnected(true);
            setIsListening(true);
            
            // Setup Input Processing
            if (!inputContextRef.current || !streamRef.current) return;
            
            sourceRef.current = inputContextRef.current.createMediaStreamSource(streamRef.current);
            sourceRef.current.connect(inputAnalyserRef.current!); 
            
            processorRef.current = inputContextRef.current.createScriptProcessor(4096, 1, 1);
            
            processorRef.current.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then((session: any) => {
                 session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            sourceRef.current.connect(processorRef.current);
            processorRef.current.connect(inputContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
                setIsSpeaking(true);
                
                nextStartTimeRef.current = Math.max(
                    nextStartTimeRef.current,
                    audioContextRef.current.currentTime
                );

                const audioBuffer = await decodeAudioData(
                    base64Audio,
                    audioContextRef.current,
                    24000,
                    1
                );

                const source = audioContextRef.current.createBufferSource();
                source.buffer = audioBuffer;
                
                // APPLY CUSTOM VOICE SETTINGS
                if (agent.voiceSettings) {
                   source.playbackRate.value = agent.voiceSettings.speed || 1.0;
                   source.detune.value = agent.voiceSettings.pitch || 0;
                }

                source.connect(outputNode);
                source.start(nextStartTimeRef.current);
                
                const rate = source.playbackRate.value || 1;
                nextStartTimeRef.current += (audioBuffer.duration / rate);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
                console.log("Interrupted");
                nextStartTimeRef.current = 0;
            }
            
            if (message.serverContent?.turnComplete) {
                setIsSpeaking(false);
            }
          },
          onclose: () => {
            console.log("Session Closed");
            cleanup();
          },
          onerror: (e) => {
            console.error("Session Error", e);
            setError("Connection Error");
            cleanup();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: agent.voice } },
          },
          systemInstruction: agent.systemInstruction,
        }
      });
      
      sessionRef.current = sessionPromise;
      
      // Start Volume Monitoring Loop
      volumeIntervalRef.current = window.setInterval(() => {
         let inputVol = 0;
         let outputVol = 0;
         
         if (inputAnalyserRef.current) {
             const data = new Uint8Array(inputAnalyserRef.current.frequencyBinCount);
             inputAnalyserRef.current.getByteFrequencyData(data);
             const avg = data.reduce((a, b) => a + b, 0) / data.length;
             inputVol = avg / 255;
         }
         
         if (outputAnalyserRef.current) {
             const data = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
             outputAnalyserRef.current.getByteFrequencyData(data);
             const avg = data.reduce((a, b) => a + b, 0) / data.length;
             outputVol = avg / 255;
         }
         
         setVolumeLevels({ input: inputVol, output: outputVol });
         setIsSpeaking(outputVol > 0.01); 
      }, 50);

    } catch (err) {
      console.error(err);
      setError("Failed to initialize");
      cleanup();
    }
  };

  useEffect(() => {
      return () => cleanup();
  }, [cleanup]);

  return {
    connect,
    disconnect: cleanup,
    isConnected,
    isSpeaking,
    volumeLevels,
    error
  };
};
