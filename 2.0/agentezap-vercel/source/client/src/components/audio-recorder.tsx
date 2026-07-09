import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Pause, Play, Trash2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  onCancel?: () => void;
  className?: string;
  disabled?: boolean;
}

export function AudioRecorder({ 
  onRecordingComplete, 
  onCancel,
  className,
  disabled = false 
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [audioUrl]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        } 
      });
      
      streamRef.current = stream;
      setPermissionDenied(false);
      
      // Determinar o melhor formato de áudio suportado
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4',
      ];
      
      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType || undefined,
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { 
          type: selectedMimeType || 'audio/webm' 
        });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        // Parar todas as tracks do stream
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start(100); // Coletar dados a cada 100ms
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      
      // Timer para atualizar o tempo
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (error: any) {
      console.error("Error starting recording:", error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  }, [isRecording, isPaused]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setAudioBlob(null);
    setAudioUrl(null);
    onCancel?.();
  }, [isRecording, audioUrl, onCancel]);

  const playPreview = useCallback(() => {
    if (audioRef.current && audioUrl) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  }, [audioUrl, isPlaying]);

  const sendAudio = useCallback(() => {
    if (audioBlob) {
      onRecordingComplete(audioBlob, recordingTime);
      // Reset state
      setAudioBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setRecordingTime(0);
    }
  }, [audioBlob, recordingTime, audioUrl, onRecordingComplete]);

  // Estado inicial - botão de gravação
  if (!isRecording && !audioBlob) {
    return (
      <div className={cn("relative", className)}>
        {permissionDenied && (
          <div className="absolute bottom-full mb-2 left-0 right-0 bg-red-100 text-red-700 text-xs p-2 rounded">
            Permissão de microfone negada. Ative nas configurações do navegador.
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={startRecording}
          disabled={disabled}
          className="text-muted-foreground hover:text-primary hover:bg-primary/10 touch-manipulation"
          title="Gravar áudio"
        >
          <Mic className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  // Estado de gravação em andamento
  if (isRecording) {
    return (
      <div className={cn(
        "flex items-center gap-2 bg-red-50 dark:bg-red-900/20 rounded-full px-3 py-1.5 animate-pulse-slow",
        className
      )}>
        {/* Indicador de gravação */}
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-3 h-3 rounded-full bg-red-500",
            !isPaused && "animate-pulse"
          )} />
          <span className="text-sm font-mono text-red-600 dark:text-red-400 min-w-[40px]">
            {formatTime(recordingTime)}
          </span>
        </div>
        
        {/* Controles */}
        <div className="flex items-center gap-1">
          {/* Pausar/Continuar */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={isPaused ? resumeRecording : pauseRecording}
            className="h-8 w-8 text-red-600 hover:bg-red-100"
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </Button>
          
          {/* Parar */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={stopRecording}
            className="h-8 w-8 text-red-600 hover:bg-red-100"
            title="Parar gravação"
          >
            <Square className="w-4 h-4" />
          </Button>
          
          {/* Cancelar */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={cancelRecording}
            className="h-8 w-8 text-muted-foreground hover:text-red-600"
            title="Cancelar"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Estado de preview do áudio gravado
  if (audioBlob && audioUrl) {
    return (
      <div className={cn(
        "flex items-center gap-2 bg-muted rounded-full px-3 py-1.5",
        className
      )}>
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
        
        {/* Play/Pause preview */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={playPreview}
          className="h-8 w-8"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        
        {/* Duração */}
        <span className="text-sm font-mono min-w-[40px]">
          {formatTime(recordingTime)}
        </span>
        
        {/* Waveform visual (simplified) */}
        <div className="flex items-center gap-0.5 h-6">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-0.5 bg-primary/60 rounded-full"
              style={{ 
                height: `${Math.random() * 100}%`,
                minHeight: '4px'
              }}
            />
          ))}
        </div>
        
        {/* Deletar */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={cancelRecording}
          className="h-8 w-8 text-muted-foreground hover:text-red-600"
          title="Deletar áudio"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        
        {/* Enviar */}
        <Button
          type="button"
          size="icon"
          onClick={sendAudio}
          className="h-8 w-8 bg-primary hover:bg-primary/90"
          title="Enviar áudio"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return null;
}
