export type VideoService = 'Runway' | 'Pika' | 'Stable Video Diffusion' | 'Luma Dream Machine' | 'Kling' | 'Midjourney';

export interface ScriptIdea {
  id: string;
  title: string;
  description: string;
}

export interface Scene {
  id: string;
  number: number;
  image?: string; // Base64 or URL
  analysis?: string;
  selectedIdea?: ScriptIdea;
  videoPrompt?: string;
  apiPayload?: string;
  consistencyData?: {
    characters: string;
    environment: string;
    mood: string;
    style: string;
    context: string;
  };
}

export interface PipelineState {
  currentStage: 1 | 2 | 3 | 4;
  scenes: Scene[];
  activeSceneId: string;
  userGuidelines: string;
  selectedService: VideoService;
  isAnalyzing: boolean;
  isGeneratingIdeas: boolean;
  isGeneratingPrompt: boolean;
}
