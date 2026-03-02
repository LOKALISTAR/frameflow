'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Sparkles, Film, ArrowRight, Check, RefreshCw, Layers, FileJson, Copy, Loader2, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { getGeminiClient, SYSTEM_PROMPT } from '@/lib/gemini';
import { PipelineState, Scene, ScriptIdea, VideoService } from '@/types';
import { cn } from '@/lib/utils';

// --- Components ---

const Header = () => (
  <header className="border-b border-stone-200 bg-white/50 backdrop-blur-md sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
          <Film size={18} strokeWidth={2.5} />
        </div>
        <span className="font-display font-bold text-xl tracking-tight text-stone-900">FrameFlow</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-xs font-mono text-stone-500 bg-stone-100 px-2 py-1 rounded-md">
          v1.0.0-beta
        </div>
      </div>
    </div>
  </header>
);

const StageIndicator = ({ currentStage }: { currentStage: number }) => {
  const stages = [
    { id: 1, label: 'Ideation' },
    { id: 2, label: 'Prompting' },
    { id: 3, label: 'Integration' },
    { id: 4, label: 'Iteration' },
  ];

  return (
    <div className="flex items-center gap-2 mb-8">
      {stages.map((stage, idx) => (
        <div key={stage.id} className="flex items-center">
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              currentStage === stage.id
                ? "bg-indigo-600 text-white shadow-sm"
                : currentStage > stage.id
                ? "bg-indigo-50 text-indigo-700"
                : "text-stone-400"
            )}
          >
            <span className="font-mono text-xs">{stage.id}</span>
            <span>{stage.label}</span>
          </div>
          {idx < stages.length - 1 && (
            <div className={cn("w-4 h-px mx-1", currentStage > stage.id ? "bg-indigo-200" : "bg-stone-200")} />
          )}
        </div>
      ))}
    </div>
  );
};

export default function Pipeline() {
  // --- State ---
  const [state, setState] = useState<PipelineState>({
    currentStage: 1,
    scenes: [],
    activeSceneId: 'scene-1',
    userGuidelines: '',
    selectedService: 'Runway',
    isAnalyzing: false,
    isGeneratingIdeas: false,
    isGeneratingPrompt: false,
  });

  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [scriptIdeas, setScriptIdeas] = useState<ScriptIdea[]>([]);
  const [generatedPrompt, setGeneratedPrompt] = useState<{
    videoPrompt: string;
    apiPayload: string;
    consistencyData: any;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Handlers ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        // Reset state for new image
        setScriptIdeas([]);
        setGeneratedPrompt(null);
        setState(prev => ({ ...prev, currentStage: 1 }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleContinue = () => {
    // Prepare for next scene
    setGeneratedPrompt(null);
    setScriptIdeas([]);
    setUploadedImage(null); // User should upload the result of the previous generation or a new ref
    setState(prev => ({ 
      ...prev, 
      currentStage: 1,
      activeSceneId: `scene-${prev.scenes.length + 1}`,
      // Keep history, just reset current view state
    }));
  };

  const generateIdeas = async () => {
    // For the first scene, image is required. For follow-ups, it's optional but recommended.
    if (state.scenes.length === 0 && !uploadedImage) {
      alert("Please upload an image to start.");
      return;
    }
    
    setState(prev => ({ ...prev, isGeneratingIdeas: true }));
    
    try {
      const ai = getGeminiClient();
      
      // Gather context from previous scenes
      const previousScene = state.scenes[state.scenes.length - 1];
      const contextBlock = previousScene ? `
        <previous_context>
        This is a follow-up scene (Scene ${state.scenes.length + 1}).
        
        PREVIOUS SCENE SUMMARY:
        - Idea: ${previousScene.selectedIdea?.title}
        - Description: ${previousScene.selectedIdea?.description}
        
        CONSISTENCY DATA TO MAINTAIN:
        - Characters: ${previousScene.consistencyData?.characters}
        - Environment: ${previousScene.consistencyData?.environment}
        - Mood: ${previousScene.consistencyData?.mood}
        - Style: ${previousScene.consistencyData?.style}
        - Narrative Context: ${previousScene.consistencyData?.context}
        
        Your task is to generate ideas that logically follow this previous scene.
        </previous_context>
      ` : '';

      const prompt = `
        <stage_1_script_ideation>
        ${contextBlock}
        
        CURRENT INPUT:
        ${uploadedImage ? "User has provided a new reference image (e.g. last frame of previous video)." : "No new image provided; rely on narrative continuity."}
        Creative Guidelines: ${state.userGuidelines || "Continue the story."}
        Target Video Service: ${state.selectedService}
        
        Please generate 3 distinct script ideas for this new scene.
        Return ONLY valid JSON array as requested in the system prompt.
        </stage_1_script_ideation>
      `;

      const parts: any[] = [{ text: prompt }];
      
      if (uploadedImage) {
        const base64Data = uploadedImage.split(',')[1];
        parts.unshift({ inlineData: { mimeType: 'image/jpeg', data: base64Data } });
      }

      const result = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        config: {
          systemInstruction: SYSTEM_PROMPT,
        },
        contents: [
          {
            role: 'user',
            parts: parts
          }
        ]
      });

      const responseText = result.text;
      if (!responseText) throw new Error("No response text");

      const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const ideas = JSON.parse(jsonString);
      
      setScriptIdeas(ideas);
    } catch (error) {
      console.error("Error generating ideas:", error);
      alert("Failed to generate ideas. Please try again.");
    } finally {
      setState(prev => ({ ...prev, isGeneratingIdeas: false }));
    }
  };

  const selectIdea = async (idea: ScriptIdea) => {
    setState(prev => ({ ...prev, isGeneratingPrompt: true, currentStage: 2 }));
    
    try {
      const ai = getGeminiClient();

      const prompt = `
        <stage_2_prompt_generation>
        Selected Idea: ${idea.title} - ${idea.description}
        Target Service: ${state.selectedService}
        
        Generate the optimized prompt, consistency data, and API payload.
        Return ONLY valid JSON object.
        </stage_2_prompt_generation>
      `;

      const result = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        config: {
          systemInstruction: SYSTEM_PROMPT,
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const responseText = result.text;
      if (!responseText) throw new Error("No response text");

      const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(jsonString);

      setGeneratedPrompt(data);
      setState(prev => ({ ...prev, currentStage: 3 }));

      // Save to scene history
      const newScene: Scene = {
        id: state.activeSceneId,
        number: state.scenes.length + 1,
        image: uploadedImage || state.scenes[state.scenes.length - 1]?.image || '', // Fallback to previous image if none uploaded
        selectedIdea: idea,
        videoPrompt: data.videoPrompt,
        apiPayload: data.apiPayload,
        consistencyData: data.consistencyData
      };

      setState(prev => ({
        ...prev,
        scenes: [...prev.scenes, newScene]
      }));

    } catch (error) {
      console.error("Error generating prompt:", error);
      alert("Failed to generate prompt.");
      setState(prev => ({ ...prev, currentStage: 1 }));
    } finally {
      setState(prev => ({ ...prev, isGeneratingPrompt: false }));
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add toast here
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-stone-50 font-sans">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Input & Preview */}
          <div className="lg:col-span-5 space-y-8">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
              <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
                <ImageIcon size={20} className="text-indigo-600" />
                {state.scenes.length > 0 ? `Scene ${state.scenes.length + 1} Input` : "Input Source"}
              </h2>
              
              <div 
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "aspect-video rounded-xl border-2 border-dashed border-stone-200 flex flex-col items-center justify-center cursor-pointer transition-all hover:border-indigo-400 hover:bg-indigo-50/30 group relative overflow-hidden",
                  uploadedImage ? "border-solid border-stone-200 p-0" : "p-8"
                )}
              >
                {uploadedImage ? (
                  <Image 
                    src={uploadedImage} 
                    alt="Source" 
                    fill 
                    className="object-cover" 
                  />
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <Upload size={20} className="text-stone-400 group-hover:text-indigo-600" />
                    </div>
                    <p className="text-sm font-medium text-stone-600">
                      {state.scenes.length > 0 ? "Upload last frame (Optional)" : "Click to upload image"}
                    </p>
                    <p className="text-xs text-stone-400 mt-1">JPG, PNG up to 10MB</p>
                  </>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageUpload} 
                  className="hidden" 
                  accept="image/*" 
                />
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
                    Creative Guidelines
                  </label>
                  <textarea
                    value={state.userGuidelines}
                    onChange={(e) => setState(prev => ({ ...prev, userGuidelines: e.target.value }))}
                    placeholder={state.scenes.length > 0 ? "Describe what happens next..." : "E.g., Dark sci-fi atmosphere, slow camera movement..."}
                    className="w-full rounded-lg border-stone-200 bg-stone-50 text-sm p-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none h-24"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">
                    Target Service
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Runway', 'Pika', 'Luma Dream Machine', 'Kling'].map((service) => (
                      <button
                        key={service}
                        onClick={() => setState(prev => ({ ...prev, selectedService: service as VideoService }))}
                        className={cn(
                          "px-3 py-2 rounded-lg text-sm font-medium border transition-all text-left",
                          state.selectedService === service
                            ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                            : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                        )}
                      >
                        {service}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={generateIdeas}
                  disabled={state.isGeneratingIdeas}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {state.isGeneratingIdeas ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      {state.scenes.length > 0 ? "Planning Next Scene..." : "Analyzing & Ideating..."}
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      {state.scenes.length > 0 ? "Generate Next Scene Ideas" : "Generate Script Ideas"}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Scene History (Mini) */}
            {state.scenes.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
                 <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
                  <Layers size={20} className="text-stone-400" />
                  Pipeline History
                </h2>
                <div className="space-y-3">
                  {state.scenes.map((scene) => (
                    <div key={scene.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50 border border-transparent hover:border-stone-100 transition-colors cursor-pointer">
                      <div className="w-12 h-12 rounded-md bg-stone-200 relative overflow-hidden flex-shrink-0">
                        {scene.image && <Image src={scene.image} alt={`Scene ${scene.number}`} fill className="object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">Scene {scene.number}</p>
                        <p className="text-xs text-stone-500 truncate">{scene.selectedIdea?.title}</p>
                      </div>
                      <div className="text-xs font-mono text-stone-400">
                        Done
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Output & Pipeline */}
          <div className="lg:col-span-7">
            <StageIndicator currentStage={state.currentStage} />

            <AnimatePresence mode="wait">
              {state.currentStage === 1 && scriptIdeas.length > 0 && (
                <motion.div
                  key="ideas"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6"
                >
                  <h3 className="text-2xl font-display font-bold text-stone-900">
                    {state.scenes.length > 0 ? `Scene ${state.scenes.length + 1} Options` : "Select a Direction"}
                  </h3>
                  <p className="text-stone-500">
                    {state.scenes.length > 0 
                      ? "Choose how the story continues based on the previous scene context."
                      : "Based on your image and guidelines, here are three potential narrative paths."}
                  </p>
                  
                  <div className="grid gap-4">
                    {scriptIdeas.map((idea, idx) => (
                      <div
                        key={idx}
                        onClick={() => selectIdea(idea)}
                        className="group bg-white p-6 rounded-xl border border-stone-200 hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <h4 className="font-bold text-lg text-stone-900 mb-2 group-hover:text-indigo-700 transition-colors">{idea.title}</h4>
                        <p className="text-stone-600 leading-relaxed">{idea.description}</p>
                        <div className="mt-4 flex items-center text-sm font-medium text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-[-10px] group-hover:translate-x-0">
                          Select this concept <ArrowRight size={16} className="ml-1" />
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {state.isGeneratingPrompt && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-64 text-stone-400"
                >
                  <Loader2 size={48} className="animate-spin text-indigo-600 mb-4" />
                  <p className="font-medium text-stone-600">Crafting optimized prompt...</p>
                  <p className="text-sm">Applying {state.selectedService} best practices</p>
                </motion.div>
              )}

              {state.currentStage >= 3 && generatedPrompt && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                    <div className="bg-stone-50 px-6 py-4 border-b border-stone-200 flex items-center justify-between">
                      <h3 className="font-display font-bold text-stone-900 flex items-center gap-2">
                        <Sparkles size={18} className="text-indigo-600" />
                        Optimized Prompt (Scene {state.scenes.length})
                      </h3>
                      <button 
                        onClick={() => copyToClipboard(generatedPrompt.videoPrompt)}
                        className="text-xs flex items-center gap-1 text-stone-500 hover:text-indigo-600 transition-colors"
                      >
                        <Copy size={14} /> Copy
                      </button>
                    </div>
                    <div className="p-6">
                      <p className="font-mono text-sm leading-relaxed text-stone-700 whitespace-pre-wrap">
                        {generatedPrompt.videoPrompt}
                      </p>
                    </div>
                  </div>

                  <div className="bg-stone-900 rounded-2xl shadow-lg overflow-hidden text-stone-300">
                    <div className="bg-black/30 px-6 py-4 border-b border-white/10 flex items-center justify-between">
                      <h3 className="font-mono text-sm font-bold text-white flex items-center gap-2">
                        <FileJson size={16} className="text-emerald-400" />
                        API Payload ({state.selectedService})
                      </h3>
                      <button 
                         onClick={() => copyToClipboard(JSON.stringify(generatedPrompt.apiPayload, null, 2))}
                         className="text-xs flex items-center gap-1 text-stone-400 hover:text-white transition-colors"
                      >
                        <Copy size={14} /> Copy JSON
                      </button>
                    </div>
                    <div className="p-6 overflow-x-auto">
                      <pre className="font-mono text-xs leading-relaxed text-emerald-50/90">
                        {JSON.stringify(generatedPrompt.apiPayload, null, 2)}
                      </pre>
                    </div>
                  </div>

                  {/* Consistency Data Visualization */}
                  <div className="bg-indigo-50/50 rounded-2xl border border-indigo-100 p-6">
                    <h3 className="font-display font-bold text-indigo-900 mb-4 flex items-center gap-2">
                      <RefreshCw size={18} />
                      Scene Memory (Consistency Data)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-bold text-indigo-800 block mb-1">Characters</span>
                        <p className="text-stone-600">{generatedPrompt.consistencyData?.characters}</p>
                      </div>
                      <div>
                        <span className="font-bold text-indigo-800 block mb-1">Environment</span>
                        <p className="text-stone-600">{generatedPrompt.consistencyData?.environment}</p>
                      </div>
                      <div>
                        <span className="font-bold text-indigo-800 block mb-1">Mood</span>
                        <p className="text-stone-600">{generatedPrompt.consistencyData?.mood}</p>
                      </div>
                      <div>
                        <span className="font-bold text-indigo-800 block mb-1">Style</span>
                        <p className="text-stone-600">{generatedPrompt.consistencyData?.style}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-4">
                    <button 
                      onClick={() => {
                        if (confirm("Are you sure you want to reset the entire pipeline? All scenes will be lost.")) {
                          setGeneratedPrompt(null);
                          setScriptIdeas([]);
                          setUploadedImage(null);
                          setState({
                            currentStage: 1,
                            scenes: [],
                            activeSceneId: 'scene-1',
                            userGuidelines: '',
                            selectedService: 'Runway',
                            isAnalyzing: false,
                            isGeneratingIdeas: false,
                            isGeneratingPrompt: false,
                          });
                        }
                      }}
                      className="px-6 py-3 bg-white border border-stone-200 text-stone-700 font-medium rounded-xl hover:bg-stone-50 transition-colors flex items-center gap-2"
                    >
                      <RefreshCw size={18} />
                      Reset All
                    </button>
                    <button 
                      onClick={handleContinue}
                      className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center gap-2"
                    >
                      <Check size={18} />
                      Continue to Scene {state.scenes.length + 1}
                    </button>
                  </div>
                </motion.div>
              )}

              {state.currentStage === 1 && scriptIdeas.length === 0 && !state.isGeneratingIdeas && (
                <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50/50 text-stone-400">
                  <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4">
                    <ArrowRight size={24} className="text-stone-300" />
                  </div>
                  <p className="font-medium">
                    {state.scenes.length > 0 
                      ? "Upload the result of the previous scene (optional) or click Generate to continue." 
                      : "Upload an image to start the pipeline"}
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
