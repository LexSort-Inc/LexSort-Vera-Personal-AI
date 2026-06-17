import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseSpeechRecognitionOptions {
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: any) => void;
  onEnd?: () => void;
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const {
    onResult,
    onError,
    onEnd,
    continuous = true,
    interimResults = true,
    lang = 'en-US',
  } = options;

  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isRestartingRef = useRef(false);

  // Check support on mount
  useEffect(() => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SpeechRecognitionAPI);
  }, []);

  const handleEnd = useCallback(() => {
    if (isRestartingRef.current) {
      isRestartingRef.current = false;
      try {
        recognitionRef.current?.start();
      } catch (err) {
        console.error('Failed to restart speech recognition:', err);
        setIsListening(false);
        if (onEnd) onEnd();
      }
    } else {
      setIsListening(false);
      if (onEnd) onEnd();
    }
  }, [onEnd]);

  const start = useCallback(() => {
    if (isListening || !supported) return;

    // Check if we are running in macOS Tauri dev mode
    const isMacTauriDev = navigator.userAgent.includes('Mac') && 
                          ((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__) && 
                          window.location.hostname === 'localhost';

    if (isMacTauriDev) {
      const confirmed = window.confirm(
        "VERA Dev Mode Warning:\n\n" +
        "On macOS, running in development mode requires your Terminal/IDE (e.g. VS Code, Terminal) to have Microphone permissions enabled in System Settings > Privacy & Security > Microphone to prevent macOS from terminating the unsigned process.\n\n" +
        "In the packaged production release, VERA will prompt you for native permissions directly without crashing.\n\n" +
        "Do you want to proceed and activate the microphone?"
      );
      if (!confirmed) return;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = lang;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let fullSessionTranscript = '';
      for (let i = 0; i < event.results.length; ++i) {
        fullSessionTranscript += event.results[i][0].transcript;
      }
      
      const isFinal = event.results[event.results.length - 1]?.isFinal || false;
      if (onResult) {
        onResult(fullSessionTranscript, isFinal);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error, event);
      if (onError) onError(event.error || event);
    };

    recognition.onend = handleEnd;

    recognitionRef.current = recognition;
    
    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  }, [isListening, supported, continuous, interimResults, lang, onResult, onError, handleEnd]);

  const stop = useCallback(() => {
    if (!isListening || !recognitionRef.current) return;
    isRestartingRef.current = false;
    try {
      recognitionRef.current.stop();
    } catch (err) {
      console.error('Error stopping speech recognition:', err);
    }
    setIsListening(false);
  }, [isListening]);

  const restart = useCallback(() => {
    if (!isListening || !recognitionRef.current) return;
    isRestartingRef.current = true;
    try {
      recognitionRef.current.abort();
    } catch (err) {
      console.error('Error aborting speech recognition during restart:', err);
      isRestartingRef.current = false;
    }
  }, [isListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        try {
          recognitionRef.current.abort();
        } catch (err) {
          // ignore
        }
      }
    };
  }, []);

  return {
    isListening,
    supported: false, // Disabled for now (added to future build list)
    start,
    stop,
    restart,
  };
}
