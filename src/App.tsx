import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import butterchurn from 'butterchurn';
import butterchurnPresets from 'butterchurn-presets';
import { Play, Pause, Upload, Download, Video, StopCircle, RefreshCw, AlertCircle, Maximize, Minimize, ChevronLeft, ChevronRight, SkipBack, SkipForward, ListPlus, Trash2, Settings2 } from 'lucide-react';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualizerContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [visualizer, setVisualizer] = useState<any>(null);
  const [presets, setPresets] = useState<Record<string, any>>({});
  const [presetKeys, setPresetKeys] = useState<string[]>([]);
  const [activePresetName, setActivePresetName] = useState<string>('');
  
  const [isRandomMode, setIsRandomMode] = useState(true);
  const [presetPlaylist, setPresetPlaylist] = useState<string[]>([]);
  const [selectedPresetToAdd, setSelectedPresetToAdd] = useState<string>('');
  
  const nextBlendTimeRef = useRef<number>(2.0);
  const presetHistoryRef = useRef<string[]>([]);
  
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const requestRef = useRef<number>();
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const streamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Initialize presets
  useEffect(() => {
    const loadedPresets = butterchurnPresets.getPresets();
    const keys = Object.keys(loadedPresets);
    setPresets(loadedPresets);
    setPresetKeys(keys);
    
    // Pick a random preset to start
    const initialPreset = keys[Math.floor(Math.random() * keys.length)];
    presetHistoryRef.current = [initialPreset];
    setActivePresetName(initialPreset);
  }, []);

  const setPreset = (name: string, blend: number) => {
    nextBlendTimeRef.current = blend;
    if (presetHistoryRef.current[presetHistoryRef.current.length - 1] !== name) {
      presetHistoryRef.current.push(name);
    }
    setActivePresetName(name);
  };

  const navigatePreset = (direction: 'left' | 'right', isHardCut: boolean) => {
    const blendTime = isHardCut ? 0.0 : 2.0;
    
    const listToUse = presetPlaylist.length > 0 ? presetPlaylist : presetKeys;
    if (listToUse.length === 0) return;

    if (direction === 'left') {
      if (presetHistoryRef.current.length > 1) {
        presetHistoryRef.current.pop();
        const prev = presetHistoryRef.current[presetHistoryRef.current.length - 1];
        nextBlendTimeRef.current = blendTime;
        setActivePresetName(prev);
        return;
      } else {
        const currentIndex = listToUse.indexOf(activePresetName);
        const prevIndex = currentIndex <= 0 ? listToUse.length - 1 : currentIndex - 1;
        setPreset(listToUse[prevIndex], blendTime);
        return;
      }
    }

    if (isRandomMode) {
       const randomPreset = listToUse[Math.floor(Math.random() * listToUse.length)];
       setPreset(randomPreset, blendTime);
    } else {
       const currentIndex = listToUse.indexOf(activePresetName);
       const nextIndex = currentIndex >= listToUse.length - 1 ? 0 : currentIndex + 1;
       setPreset(listToUse[nextIndex], blendTime);
    }
  };

  // Initialize AudioContext and Visualizer on first user interaction
  const initAudio = useCallback(async () => {
    if (audioContext && isReady) return;

    try {
      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new AudioContextClass();
      setAudioContext(ctx);
      
      if (canvasRef.current) {
        const viz = butterchurn.default ? butterchurn.default.createVisualizer(ctx, canvasRef.current, {
          width: 800,
          height: 600,
          pixelRatio: 1, // Fixed: High pixel ratio causes VRAM cache memory leaks and WebGL crashes on certain heavy presets
          textureRatio: 1
        }) : butterchurn.createVisualizer(ctx, canvasRef.current, {
          width: 800,
          height: 600,
          pixelRatio: 1, // Fixed: Force pixel ratio to 1 to prevent VRAM exhaustion
          textureRatio: 1
        });
        setVisualizer(viz);
      }
      setIsReady(true);
    } catch (err) {
      console.error("Failed to initialize audio context", err);
    }
  }, [audioContext, isReady]);

  // Handle Preset Change
  useEffect(() => {
    if (visualizer && activePresetName && presets[activePresetName]) {
      visualizer.loadPreset(presets[activePresetName], nextBlendTimeRef.current);
      nextBlendTimeRef.current = 2.0; // reset to default
    }
  }, [activePresetName, visualizer, presets]);

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const newUrl = URL.createObjectURL(file);
      setAudioUrl(newUrl);
      setIsPlaying(false);
    }
  };

  // Render loop
  const render = useCallback(() => {
    if (visualizer && isPlaying) {
      visualizer.render();
    }
    requestRef.current = requestAnimationFrame(render);
  }, [visualizer, isPlaying]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(render);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [render]);

  // Playback Control
  const togglePlay = async () => {
    await initAudio();
    
    if (!audioRef.current || !audioContext) return;

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    if (!sourceNodeRef.current) {
      // Create source node once
      sourceNodeRef.current = audioContext.createMediaElementSource(audioRef.current);
      
      // Create destination for recording
      streamDestRef.current = audioContext.createMediaStreamDestination();
      
      // Connect to visualizer, speakers, and recording dest
      if (visualizer) {
        visualizer.connectAudio(sourceNodeRef.current);
      }
      sourceNodeRef.current.connect(audioContext.destination);
      sourceNodeRef.current.connect(streamDestRef.current);
    }

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Recording Control
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    await initAudio();
    if (!canvasRef.current || !streamDestRef.current) return;

    // Combine canvas video stream and audio stream
    const canvasStream = canvasRef.current.captureStream(30); // 30 FPS
    const audioStream = streamDestRef.current.stream;
    
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioStream.getAudioTracks()
    ]);

    // Try to find supported mime type
    let mimeType = 'video/webm;codecs=vp9,opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }
    }

    const recorder = new MediaRecorder(combinedStream, { mimeType });
    mediaRecorderRef.current = recorder;
    
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.style.display = 'none';
      a.href = url;
      a.download = `visualizer-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      setRecordedChunks([]);
      
      // Fixed: Stop all tracks to free up the video encoder and prevent VRAM/memory leaks
      combinedStream.getTracks().forEach(track => track.stop());
    };

    recorder.start();
    setIsRecording(true);
    
    // Auto play if not playing
    if (!isPlaying) {
      togglePlay();
    }
  };


  return (
    <div className="h-[100dvh] w-full bg-black text-white font-sans flex flex-col overflow-hidden relative selection:bg-indigo-500/30">
      
      {/* Canvas Area */}
      <div className="relative flex-1 w-full bg-neutral-950 overflow-hidden">
        {!audioFile && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 z-10 p-6 text-center">
            <Upload className="w-16 h-16 mb-4 opacity-30 text-indigo-400" />
            <h2 className="text-xl md:text-2xl font-semibold text-neutral-300 mb-2 tracking-tight">Milkdrop Visualizer</h2>
            <p className="text-sm">Upload an MP3 to begin the experience.</p>
          </div>
        )}
        <canvas 
          ref={canvasRef} 
          width={800} 
          height={600} 
          className="w-full h-full object-cover block"
        />
        
        {/* Top Overlay Controls (Header/Status) */}
        <div className="absolute top-0 inset-x-0 p-4 md:p-6 flex justify-between items-start z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none">
          <h1 className="text-lg md:text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent drop-shadow-md">
            Milkdrop
          </h1>
          {isRecording && (
            <div className="flex items-center gap-2 bg-red-500/20 text-red-400 px-3 py-1.5 rounded-full border border-red-500/30 backdrop-blur-md animate-pulse pointer-events-auto shadow-lg shadow-red-500/10">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-xs font-bold uppercase tracking-widest">Rec</span>
            </div>
          )}
        </div>


      </div>

      {/* Docked Control Deck - One Handed Ergonomics */}
      <div className="w-full bg-neutral-900/95 backdrop-blur-xl border-t border-white/10 rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.7)] z-30 flex-shrink-0 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]">
        <div className="max-w-md mx-auto w-full flex flex-col pb-[env(safe-area-inset-bottom)]">
          
          {/* Pull Tab for Settings */}
          <button 
            onClick={() => setShowSettings(!showSettings)} 
            className="w-full h-12 flex justify-center items-center opacity-60 hover:opacity-100 active:scale-95 transition-all"
            aria-label="Toggle settings"
          >
            <div className={`w-12 h-1.5 rounded-full transition-colors ${showSettings ? 'bg-indigo-500/50' : 'bg-neutral-600'}`} />
          </button>

          {/* Core Controls - Always visible */}
          <div className="px-6 pb-8 space-y-6">
            
            {/* Scrubber */}
            <div className="flex flex-col items-center gap-2">
               <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Active Preset</span>
               <div className="w-full flex items-center justify-between gap-3">
                  <button onClick={() => navigatePreset('left', false)} className="p-4 bg-white/5 active:bg-white/10 rounded-2xl text-neutral-400 active:text-white transition-colors border border-white/5 shadow-sm">
                     <ChevronLeft className="w-7 h-7" />
                  </button>
                  <div className="flex-1 flex flex-col justify-center items-center overflow-hidden px-2 h-14 bg-black/20 rounded-2xl border border-white/5">
                    <span className="text-sm md:text-base font-semibold text-neutral-100 truncate w-full text-center block" title={activePresetName.replace(/-/g, ' ')}>
                      {activePresetName ? activePresetName.replace(/-/g, ' ') : 'Loading...'}
                    </span>
                  </div>
                  <button onClick={() => navigatePreset('right', false)} className="p-4 bg-white/5 active:bg-white/10 rounded-2xl text-neutral-400 active:text-white transition-colors border border-white/5 shadow-sm">
                     <ChevronRight className="w-7 h-7" />
                  </button>
               </div>
            </div>

            {/* Primary Actions Row */}
            <div className="flex items-center justify-between gap-4">
               {/* Upload */}
               <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center w-[72px] h-[72px] rounded-3xl bg-neutral-800 active:bg-neutral-700 text-indigo-400 transition-colors border border-white/5 shadow-md">
                 <Upload className="w-7 h-7 mb-1" />
                 <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">Load</span>
               </button>
               
               {/* Play/Pause */}
               <button 
                 onClick={togglePlay} 
                 disabled={!audioFile} 
                 className="flex-1 h-[88px] flex items-center justify-center bg-indigo-500 active:bg-indigo-600 disabled:bg-neutral-800 disabled:text-neutral-600 text-white rounded-[2.5rem] transition-all duration-300 ease-out shadow-[0_8px_30px_rgba(99,102,241,0.3)] active:shadow-none active:scale-95 disabled:scale-100 disabled:shadow-none border border-indigo-400/20"
               >
                 {isPlaying ? <Pause className="w-12 h-12 fill-current" /> : <Play className="w-12 h-12 fill-current ml-2" />}
               </button>

               {/* Record */}
               <button onClick={toggleRecording} disabled={!audioFile} className={`flex flex-col items-center justify-center w-[72px] h-[72px] rounded-3xl transition-colors border shadow-md ${isRecording ? 'bg-red-500/20 text-red-400 border-red-500/30 active:bg-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'bg-neutral-800 text-neutral-400 border-white/5 active:bg-neutral-700 disabled:opacity-50'}`}>
                 {isRecording ? <StopCircle className="w-7 h-7 mb-1" /> : <Video className="w-7 h-7 mb-1" />}
                 <span className="text-[9px] font-bold uppercase tracking-wider">{isRecording ? 'Stop' : 'Rec'}</span>
               </button>
            </div>
          </div>

          {/* Expandable Settings Area */}
          <div className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${showSettings ? 'max-h-[50vh] opacity-100' : 'max-h-0 opacity-0'}`}>
             <div className="px-6 pb-8 space-y-6 overflow-y-auto max-h-[50vh] custom-scrollbar border-t border-white/5 pt-6 mt-[-1rem]">
                
                {/* Mode Toggle */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest text-center">Playback Mode</h4>
                  <div className="flex items-center justify-between bg-black/50 p-1.5 rounded-2xl border border-white/5">
                     <button onClick={() => setIsRandomMode(false)} className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all duration-300 ${!isRandomMode ? 'bg-neutral-800 text-white shadow-md border border-white/10' : 'text-neutral-500 active:text-neutral-300 border border-transparent'}`}>Sequential</button>
                     <button onClick={() => setIsRandomMode(true)} className={`flex-1 py-3 text-sm font-semibold rounded-xl transition-all duration-300 ${isRandomMode ? 'bg-neutral-800 text-white shadow-md border border-white/10' : 'text-neutral-500 active:text-neutral-300 border border-transparent'}`}>Random</button>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => navigatePreset('right', false)}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-500/10 active:bg-indigo-500/20 text-indigo-400 transition-colors px-4 py-4 rounded-2xl text-sm font-bold tracking-wide border border-indigo-500/20 shadow-sm"
                  >
                    <RefreshCw className="w-5 h-5" />
                    {isRandomMode ? 'Pick Random Preset' : 'Next Preset'}
                  </button>

                  <div className="relative">
                    <select
                      value={activePresetName}
                      onChange={(e) => setPreset(e.target.value, 2.0)}
                      className="w-full bg-neutral-900 border border-white/10 rounded-2xl px-4 py-4 text-sm text-white appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-500 pr-10 shadow-sm"
                    >
                      {presetKeys.map(key => (
                        <option key={key} value={key}>
                          {key.replace(/-/g, ' ')}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-500">
                      <Settings2 className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Playlist UI */}
                <div className="pt-6 border-t border-white/10">
                  <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest text-center mb-4">Custom Playlist</h4>
                  
                  <div className="flex gap-2 mb-4">
                    <select
                      value={selectedPresetToAdd}
                      onChange={(e) => setSelectedPresetToAdd(e.target.value)}
                      className="flex-1 bg-black/50 border border-white/10 rounded-2xl px-4 py-3 text-xs md:text-sm text-white appearance-none focus:outline-none focus:ring-1 focus:ring-indigo-500 truncate shadow-sm"
                    >
                      <option value="">Select preset to add...</option>
                      {presetKeys.map(key => (
                        <option key={key} value={key}>
                          {key.replace(/-/g, ' ')}
                        </option>
                      ))}
                    </select>
                    <button 
                      onClick={() => {
                        if (selectedPresetToAdd && !presetPlaylist.includes(selectedPresetToAdd)) {
                          setPresetPlaylist([...presetPlaylist, selectedPresetToAdd]);
                        }
                      }}
                      className="p-3 w-[52px] h-[52px] flex items-center justify-center bg-indigo-500/20 active:bg-indigo-500/30 text-indigo-400 rounded-2xl border border-indigo-500/20 transition-colors shadow-sm"
                      title="Add to Playlist"
                    >
                      <ListPlus className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                    {presetPlaylist.length === 0 ? (
                      <div className="bg-black/30 rounded-2xl border border-white/5 p-4 text-center">
                        <p className="text-xs text-neutral-500 italic">Global pool active. Add presets here to limit the pool to your favorites.</p>
                      </div>
                    ) : (
                      presetPlaylist.map((preset, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-black/40 px-4 py-3 rounded-2xl border border-white/5 shadow-sm">
                          <span className="text-xs text-neutral-300 truncate pr-2 font-medium">{preset.replace(/-/g, ' ')}</span>
                          <button 
                            onClick={() => setPresetPlaylist(presetPlaylist.filter(p => p !== preset))}
                            className="text-neutral-500 active:text-red-400 p-2 -mr-2 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  
                  {presetPlaylist.length > 0 && (
                    <button
                      onClick={() => setPresetPlaylist([])}
                      className="mt-4 text-xs font-bold text-neutral-500 active:text-neutral-300 transition-colors w-full text-center py-2"
                    >
                      Clear Playlist
                    </button>
                  )}
                </div>

                <div className="pt-6 pb-4 flex items-start gap-3 text-indigo-300/70 text-xs">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="leading-relaxed">Videos are saved in WebM format. Use a free online converter to change to MP4 if needed for sharing.</p>
                </div>
             </div>
          </div>

          {/* Hidden inputs */}
          <input
            type="file"
            ref={fileInputRef}
            accept="audio/mpeg, audio/wav, audio/mp3"
            onChange={handleFileUpload}
            className="hidden"
          />
          {audioUrl && (
            <audio 
              ref={audioRef} 
              src={audioUrl} 
              onEnded={() => {
                setIsPlaying(false);
                if (isRecording) toggleRecording();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
