
export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

export enum Gender {
  Male = 'Male',
  Female = 'Female',
  Neutral = 'Neutral',
}

export interface VoiceOption {
  id: string;      // Unique UI Identifier
  apiId: string;   // The actual Gemini Voice Name
  name: string;
  gender: Gender;
  description: string;
  color: string;
  speed: number;   // 0.5 - 1.5
  pitch: number;   // -1200 - 1200 (cents)
  isCustom?: boolean; // Flag for user-saved voices
}

export interface AgentPersona {
  id: string;
  name: string;
  voice: string; // This stores the apiId
  voiceSettings: {
    speed: number;
    pitch: number;
  };
  systemInstruction: string;
  avatarColor: string;
}

export interface AudioVisualizerData {
  inputLevel: number; // 0-1
  outputLevel: number; // 0-1
}

export interface CastMember {
  id: string;
  name: string;
  voiceId: string; // Refers to VoiceOption.id
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  agent: AgentPersona;
  text: string;
  audioData: Int16Array | null;
  duration: number;
  voiceVolume: number;
  isPodcast?: boolean;
  guestAgent?: AgentPersona;
  cast?: CastMember[]; // Explicit cast for Story Mode
}

export interface User {
  id: string;
  username: string;
  avatar: string;
  createdAt: number;
}
