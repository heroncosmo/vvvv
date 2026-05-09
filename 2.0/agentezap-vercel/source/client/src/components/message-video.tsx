import { useState, useRef } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface MessageVideoProps {
  src: string;
  caption?: string | null;
  duration?: number | null;
  fromMe?: boolean;
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function MessageVideo({ src, caption, duration, fromMe = false }: MessageVideoProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fullscreenVideoRef = useRef<HTMLVideoElement>(null);

  const handlePlayPause = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const video = isFullscreen ? fullscreenVideoRef.current : videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = isFullscreen ? fullscreenVideoRef.current : videoRef.current;
    if (!video) return;
    
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleTimeUpdate = () => {
    const video = isFullscreen ? fullscreenVideoRef.current : videoRef.current;
    if (!video) return;
    
    const progress = (video.currentTime / video.duration) * 100;
    setProgress(progress);
    setCurrentTime(video.currentTime);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = isFullscreen ? fullscreenVideoRef.current : videoRef.current;
    if (!video) return;
    
    const newTime = (parseFloat(e.target.value) / 100) * video.duration;
    video.currentTime = newTime;
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(src);
      const contentType = response.headers.get('Content-Type') || 'video/mp4';
      const blob = await response.blob();
      
      // Garantir que o blob tem o MIME type correto
      const finalBlob = new Blob([blob], { type: contentType });
      const url = window.URL.createObjectURL(finalBlob);
      
      // Determinar extensão baseado no MIME type
      let ext = '.mp4';
      if (contentType.includes('webm')) ext = '.webm';
      else if (contentType.includes('mov') || contentType.includes('quicktime')) ext = '.mov';
      else if (contentType.includes('avi')) ext = '.avi';
      
      const link = document.createElement("a");
      link.href = url;
      link.download = `whatsapp-video-${Date.now()}${ext}`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao baixar vídeo:", error);
      // Fallback: abrir em nova aba
      window.open(src, '_blank', 'noopener,noreferrer');
    }
  };

  const openFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFullscreen(true);
  };

  return (
    <>
      {/* Thumbnail/Preview */}
      <div 
        className="relative group cursor-pointer max-w-[280px] rounded-lg overflow-hidden"
        onClick={() => setIsFullscreen(true)}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => !isPlaying && setShowControls(true)}
      >
        <video
          ref={videoRef}
          src={src}
          className="w-full max-h-[280px] object-cover"
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
          preload="metadata"
          muted={isMuted}
          playsInline
        />

        {/* Overlay com botão de play grande */}
        <div className={`absolute inset-0 bg-black/30 flex items-center justify-center transition-opacity ${
          isPlaying && !showControls ? "opacity-0" : "opacity-100"
        }`}>
          <button
            onClick={handlePlayPause}
            className="w-14 h-14 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-transform hover:scale-110"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 text-gray-800" fill="currentColor" />
            ) : (
              <Play className="w-6 h-6 text-gray-800 ml-1" fill="currentColor" />
            )}
          </button>
        </div>

        {/* Duração no canto */}
        {duration && !isPlaying && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
            {formatDuration(duration)}
          </div>
        )}

        {/* Botões de ação no canto */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="secondary"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              openFullscreen(e);
            }}
            className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
          >
            <Maximize2 className="w-4 h-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleDownload(e);
            }}
            className="h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>

        {/* Caption */}
        {caption && (
          <div className={`p-2 text-sm ${
            fromMe ? "text-primary-foreground" : "text-foreground"
          }`}>
            {caption}
          </div>
        )}
      </div>

      {/* Fullscreen Modal */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden bg-black border-0">
          <DialogTitle className="sr-only">Vídeo</DialogTitle>
          <div className="relative w-full h-full flex items-center justify-center">
            <video
              ref={fullscreenVideoRef}
              src={src}
              className="max-w-full max-h-[calc(95vh-80px)]"
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
              autoPlay
              muted={isMuted}
              playsInline
              onClick={handlePlayPause}
            />

            {/* Controls Bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
              {/* Progress Bar */}
              <div className="mb-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={progress}
                  onChange={handleSeek}
                  className="w-full h-1 bg-white/30 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-3
                    [&::-webkit-slider-thumb]:h-3
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-white"
                />
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-between text-white">
                <div className="flex items-center gap-3">
                  <button onClick={handlePlayPause} className="hover:scale-110 transition">
                    {isPlaying ? (
                      <Pause className="w-6 h-6" fill="currentColor" />
                    ) : (
                      <Play className="w-6 h-6" fill="currentColor" />
                    )}
                  </button>
                  
                  <button onClick={handleMute} className="hover:scale-110 transition">
                    {isMuted ? (
                      <VolumeX className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>

                  <span className="text-sm">
                    {formatDuration(currentTime)} / {formatDuration(fullscreenVideoRef.current?.duration)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDownload}
                    className="h-8 w-8 hover:bg-white/20 text-white"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Caption in Fullscreen */}
            {caption && (
              <div className="absolute top-4 left-4 right-4 bg-black/70 text-white p-3 rounded-lg text-sm">
                {caption}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
