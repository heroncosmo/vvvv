import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Send, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserAudioRecorderProps {
  onSend: (audioBlob: Blob, duration: number, mimeType: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}

type RecorderState = 'starting' | 'recording' | 'sending' | 'error';

export function UserAudioRecorder({ 
  onSend, 
  onCancel,
  disabled,
  className
}: UserAudioRecorderProps) {
  const [state, setState] = useState<RecorderState>('starting');
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');
  const durationRef = useRef<number>(0);
  const hasStartedRef = useRef<boolean>(false);

  const isMobile = typeof window !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.innerWidth < 768
  );

  // Sync duration to ref for use in onstop
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];
    mediaRecorderRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      console.log('[AudioRecorder] 🎤 Starting...');
      
      // Reset
      chunksRef.current = [];
      setDuration(0);
      durationRef.current = 0;
      
      // Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      if (stream.getAudioTracks().length === 0) {
        throw new Error('Nenhum microfone encontrado');
      }
      
      console.log('[AudioRecorder] ✅ Got stream');
      streamRef.current = stream;
      
      // Find supported format
      const formats = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', ''];
      let mimeType = formats.find(f => f === '' || MediaRecorder.isTypeSupported(f)) || '';
      mimeTypeRef.current = mimeType || 'audio/webm';
      
      // Create MediaRecorder
      const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      
      console.log('[AudioRecorder] 📼 Created, mimeType:', recorder.mimeType);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          console.log('[AudioRecorder] 📦 Chunk:', e.data.size, 'bytes');
        }
      };

      recorder.onstop = () => {
        console.log('[AudioRecorder] ⏹️ Stopped, chunks:', chunksRef.current.length);
        
        // Stop stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
          console.log('[AudioRecorder] 🎵 Blob:', blob.size, 'bytes, duration:', durationRef.current);
          
          // Send immediately
          setState('sending');
          onSend(blob, durationRef.current, mimeTypeRef.current);
          
          // Close the recorder after a brief delay
          setTimeout(() => {
            onCancel?.();
          }, 500);
        } else {
          console.warn('[AudioRecorder] No audio chunks captured');
          onCancel?.();
        }
        
        chunksRef.current = [];
        mediaRecorderRef.current = null;
      };

      recorder.onerror = (e: any) => {
        console.error('[AudioRecorder] ❌ Error:', e.error);
        setError('Erro na gravação');
        setState('error');
        cleanup();
      };

      // Start recording
      recorder.start();
      setState('recording');
      console.log('[AudioRecorder] 🔴 Recording started');
      
      // Start timer
      timerRef.current = setInterval(() => {
        setDuration(prev => {
          const newVal = prev + 1;
          durationRef.current = newVal;
          return newVal;
        });
      }, 1000);

    } catch (err: any) {
      console.error('[AudioRecorder] ❌ Start error:', err);
      setError(err.message || 'Erro ao acessar microfone');
      setState('error');
      cleanup();
    }
  }, [onSend, cleanup]);

  // Auto-start recording when component mounts
  useEffect(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      startRecording();
    }
  }, [startRecording]);

  const stopAndSend = useCallback(() => {
    console.log('[AudioRecorder] ⏹️ Stop and send, duration:', durationRef.current);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    console.log('[AudioRecorder] 🗑️ Cancel');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Remove the onstop handler to prevent sending
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    cleanup();
    setDuration(0);
    onCancel?.();
  }, [cleanup, onCancel]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // === STARTING STATE - Show loading ===
  if (state === 'starting') {
    return (
      <div className={cn(
        "flex items-center justify-center gap-3 w-full py-2",
        className
      )}>
        <Loader2 className="w-5 h-5 animate-spin text-red-500" />
        <span className="text-sm text-muted-foreground">Acessando microfone...</span>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => {
            cleanup();
            onCancel?.();
          }}
          className="h-8 w-8 text-muted-foreground"
          type="button"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  // === ERROR STATE ===
  if (state === 'error') {
    return (
      <div className={cn(
        "flex items-center justify-center gap-3 w-full py-2",
        className
      )}>
        <span className="text-sm text-destructive">{error || 'Erro ao gravar'}</span>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => {
            cleanup();
            onCancel?.();
          }}
          type="button"
        >
          Fechar
        </Button>
      </div>
    );
  }

  // === RECORDING STATE - Full width recording bar ===
  if (state === 'recording') {
    return (
      <div className={cn(
        "flex items-center gap-3 w-full bg-gradient-to-r from-red-500/10 to-red-600/10 dark:from-red-500/20 dark:to-red-600/20",
        "rounded-full px-4 py-2 border border-red-500/30",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
        className
      )}>
        {/* Recording indicator */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/50" />
          <span className="text-sm font-medium text-red-600 dark:text-red-400 hidden sm:inline">
            Gravando
          </span>
        </div>
        
        {/* Waveform animation */}
        <div className="flex items-center gap-0.5 flex-1 justify-center">
          {[...Array(isMobile ? 8 : 16)].map((_, i) => (
            <div 
              key={i}
              className="w-1 bg-red-500/60 rounded-full animate-pulse"
              style={{ 
                height: `${8 + Math.sin(i * 0.8) * 8}px`,
                animationDelay: `${i * 0.05}s`,
                animationDuration: '0.5s'
              }} 
            />
          ))}
        </div>
        
        {/* Timer */}
        <span className="text-sm font-mono font-medium text-red-600 dark:text-red-400 tabular-nums min-w-[40px]">
          {formatTime(duration)}
        </span>
        
        {/* Cancel button */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={cancelRecording}
          className={cn(
            "text-red-500 hover:text-red-600 hover:bg-red-500/10 flex-shrink-0",
            isMobile ? "h-10 w-10" : "h-9 w-9"
          )}
          type="button"
        >
          <X className="w-5 h-5" />
        </Button>
        
        {/* Send button */}
        <Button 
          size="icon" 
          onClick={stopAndSend}
          className={cn(
            "bg-red-500 hover:bg-red-600 text-white flex-shrink-0 shadow-lg",
            isMobile ? "h-10 w-10" : "h-9 w-9"
          )}
          type="button"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  // === SENDING STATE ===
  if (state === 'sending') {
    return (
      <div className={cn(
        "flex items-center justify-center gap-2 w-full py-2",
        className
      )}>
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">Enviando áudio...</span>
      </div>
    );
  }

  return null;
}
