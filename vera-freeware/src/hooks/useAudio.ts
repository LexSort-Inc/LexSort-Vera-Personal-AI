import { useState, useRef, useEffect } from "react";

export function useAudio() {
  const [audioMode, setAudioMode] = useState(false);
  const audioModeRef = useRef(false);

  useEffect(() => {
    audioModeRef.current = audioMode;
  }, [audioMode]);

  return { audioMode, setAudioMode, audioModeRef };
}
