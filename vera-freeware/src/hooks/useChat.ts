import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Message } from "../App";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>("");
  const [streaming, setStreaming] = useState<boolean>(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const initialTextRef = useRef("");

  const speakText = useCallback((text: string, onEndCallback?: () => void) => {
    if (!("speechSynthesis" in window)) {
      if (onEndCallback) onEndCallback();
      return;
    }
    window.speechSynthesis.cancel();

    const cleanText = text
      .replace(/\*+/g, "")
      .replace(/`+/g, "")
      .replace(/#+/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();

    if (!cleanText) {
      if (onEndCallback) onEndCallback();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
      v.lang.startsWith("en") &&
      (v.name.includes("Google") || v.name.includes("Samantha") || v.name.includes("Daniel") || v.name.includes("Microsoft"))
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => { if (onEndCallback) onEndCallback(); };
    utterance.onerror = () => { if (onEndCallback) onEndCallback(); };
    window.speechSynthesis.speak(utterance);
  }, []);

  const autoSaveChat = async (
    convId: string | null,
    msgList: Message[],
    firstUserText: string,
    setActiveConversationId: (id: string | null) => void,
    loadConversationsList: () => Promise<void>,
  ) => {
    try {
      let id = convId;
      if (!id) {
        id = `conv_${Date.now()}`;
        const autoTitle = firstUserText.slice(0, 30) || "New Conversation";
        await invoke("create_conversation", { id, title: autoTitle });
        setActiveConversationId(id);
      }
      await invoke("save_messages", { conversationId: id, messages: msgList });
      await loadConversationsList();
    } catch (err) {
      console.error("Auto-save failed:", err);
    }
  };

  return {
    messages, setMessages,
    input, setInput,
    streaming, setStreaming,
    bottomRef,
    abortRef,
    inputRef,
    initialTextRef,
    speakText,
    autoSaveChat,
  };
}
