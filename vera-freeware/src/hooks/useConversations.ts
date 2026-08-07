import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Conversation } from "../App";

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [editingRenameId, setEditingRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [showHistory, setShowHistory] = useState<boolean>(true);

  const loadConversationsList = async () => {
    try {
      const list = await invoke<Conversation[]>("get_conversations");
      setConversations(list);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  };

  const handleRenameStart = (id: string, currentTitle: string) => {
    setEditingRenameId(id);
    setRenameValue(currentTitle);
    setTimeout(() => renameInputRef.current?.select(), 50);
  };

  const handleRenameSubmit = async (id: string) => {
    if (!renameValue.trim()) { setEditingRenameId(null); return; }
    try {
      await invoke("rename_conversation", { id, title: renameValue.trim() });
      await loadConversationsList();
    } catch (err) {
      console.error("Failed to rename conversation:", err);
    }
    setEditingRenameId(null);
  };

  const handleRenameCancel = () => {
    setEditingRenameId(null);
  };

  return {
    conversations, setConversations,
    activeConversationId, setActiveConversationId,
    editingRenameId, setEditingRenameId,
    renameValue, setRenameValue,
    renameInputRef,
    showHistory, setShowHistory,
    loadConversationsList,
    handleRenameStart, handleRenameSubmit, handleRenameCancel,
  };
}
