import { useState, useRef, useEffect, useMemo } from "react";
import { Play, Pause, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MessageAudioProps {
  src: string;
  duration?: number | null;
  fromMe?: boolean;
}

// Gerar waveform pseudo-aleatório mas consistente baseado na duração
function generateWaveform(duration: number, bars: number = 40): number[] {
  const heights: number[] = [];
  const seed = Math.floor(duration * 100);
  for (let i = 0; i < bars; i++) {
    // Gerar altura pseudo-aleatória baseada no índice e duração
    const noise = Math.sin(seed + i * 0.7) * 0.5 + Math.cos(seed * 0.3 + i * 1.2) * 0.3;
    const base = 0.3 + Math.abs(noise) * 0.7;
    heights.push(Math.min(1, Math.max(0.2, base)));
  }
  return heights;
}

export function MessageAudio({ src, duration, fromMe = false }: MessageAudioProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Gerar waveform baseado na duração
  const waveform = useMemo(() => generateWaveform(audioDuration || 10, 35), [audioDuration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setAudioDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (index: number) => {
    const audio = audioRef.current;
    if (!audio || !audioDuration) return;

    const newTime = (index / waveform.length) * audioDuration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const cyclePlaybackRate = () => {
    const audio = audioRef.current;
    if (!audio) return;

    const rates = [1, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextRate = rates[(currentIndex + 1) % rates.length];
    audio.playbackRate = nextRate;
    setPlaybackRate(nextRate);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleDownload = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const response = await fetch(src);
      const contentType = response.headers.get('Content-Type') || 'audio/ogg';
      const blob = await response.blob();
      
      // Garantir que o blob tem o MIME type correto
      const finalBlob = new Blob([blob], { type: contentType });
      const url = window.URL.createObjectURL(finalBlob);
      
      // Determinar extensão baseado no MIME type
      let ext = '.ogg';
      if (contentType.includes('mp3') || contentType.includes('mpeg')) ext = '.mp3';
      else if (contentType.includes('wav')) ext = '.wav';
      else if (contentType.includes('m4a')) ext = '.m4a';
      
      const link = document.createElement("a");
      link.href = url;
      link.download = `whatsapp-audio-${Date.now()}${ext}`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao baixar áudio:", error);
      // Fallback: abrir em nova aba
      window.open(src, '_blank', 'noopener,noreferrer');
    }
  };

  const progress = audioDuration > 0 ? currentTime / audioDuration : 0;
  const playedBars = Math.floor(progress * waveform.length);

  return (
    <div className="flex items-center gap-2 min-w-[240px] max-w-[300px] py-1">
      <audio ref={audioRef} src={src} preload="metadata" />
      
      {/* Play/Pause Button - Estilo WhatsApp */}
      <button
        onClick={togglePlay}
        className={`h-11 w-11 rounded-full flex-shrink-0 flex items-center justify-center transition-all ${
          fromMe 
            ? "bg-white/20 hover:bg-white/30 text-white" 
            : "bg-[#00a884] hover:bg-[#00a884]/90 text-white"
        }`}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5" fill="currentColor" />
        ) : (
          <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
        )}
      </button>

      {/* Waveform */}
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-[2px] h-8 cursor-pointer">
          {waveform.map((height, index) => {
            const isPlayed = index < playedBars;
            return (
              <div
                key={index}
                onClick={() => handleSeek(index)}
                className={`w-[3px] rounded-full transition-all ${
                  isPlayed
                    ? fromMe 
                      ? "bg-white" 
                      : "bg-[#00a884]"
                    : fromMe
                      ? "bg-white/40"
                      : "bg-gray-400/60"
                } ${isPlaying && index === playedBars ? "animate-pulse" : ""}`}
                style={{ 
                  height: `${height * 100}%`,
                  minHeight: "4px"
                }}
              />
            );
          })}
        </div>
        
        {/* Time and Speed */}
        <div className={`flex items-center justify-between text-xs ${
          fromMe ? "text-white/70" : "text-muted-foreground"
        }`}>
          <span>{formatTime(currentTime)}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={cyclePlaybackRate}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                fromMe 
                  ? "bg-white/20 hover:bg-white/30" 
                  : "bg-gray-200 hover:bg-gray-300 text-gray-700"
              }`}
            >
              {playbackRate}x
            </button>
            <span>{formatTime(audioDuration)}</span>
          </div>
        </div>
      </div>

      {/* Download Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          handleDownload(e);
        }}
        className={`h-8 w-8 flex-shrink-0 ${
          fromMe 
            ? "hover:bg-white/20 text-white" 
            : "hover:bg-secondary"
        }`}
      >
        <Download className="w-4 h-4" />
      </Button>
    </div>
  );
}
