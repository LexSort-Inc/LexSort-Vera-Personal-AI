// Multilingual Quick-Translate — context-engineered translation.
// Honest framing: there is no custom translation model. These prompt
// templates steer the user's existing local Ollama model; quality is
// model-dependent. Everything stays on-device.

export type TranslateTone = "business" | "casual" | "academic" | "idiomatic";

export const TONE_INSTRUCTIONS: Record<TranslateTone, string> = {
  business:
    "Use formal, professional register. Prefer precise business vocabulary; avoid slang.",
  casual:
    "Use relaxed, conversational register, as between friends.",
  academic:
    "Use precise, scholarly register with correct terminology; preserve citations and structure.",
  idiomatic:
    "Render into natural native idiom — translate meaning and intent, not word-for-word; use expressions a native speaker would actually say.",
};

/** OS/browser locale, e.g. "fr-FR" → "fr". Falls back to "en". */
export function detectLocale(): string {
  try {
    const tag = navigator.language || (navigator as any).userLanguage || "en";
    return tag.split("-")[0].toLowerCase() || "en";
  } catch {
    return "en";
  }
}

const LANG_NAMES: Record<string, string> = {
  en: "English", fr: "French", es: "Spanish", de: "German",
  it: "Italian", pt: "Portuguese", nl: "Dutch", ru: "Russian",
  zh: "Chinese", ja: "Japanese", ko: "Korean", ar: "Arabic",
  hi: "Hindi", tr: "Turkish", pl: "Polish", uk: "Ukrainian",
  sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish",
  el: "Greek", he: "Hebrew", th: "Thai", vi: "Vietnamese",
  id: "Indonesian", ms: "Malay", cs: "Czech", ro: "Romanian",
  hu: "Hungarian",
};

export function langName(code: string): string {
  const c = code.trim().toLowerCase();
  return LANG_NAMES[c] ?? code;
}

/** Builds the chat prompt that performs the translation turn. */
export function buildTranslatePrompt(
  sourceText: string,
  targetLang: string,
  tone: TranslateTone,
): string {
  const target = langName(targetLang) || "English";
  return (
    `Translate the following text into ${target}.\n` +
    `Tone: ${TONE_INSTRUCTIONS[tone]}\n` +
    `Rules: preserve the original meaning, numbers, names and Markdown formatting. ` +
    `Output ONLY the translation, no commentary, no quotes around it.\n\n` +
    `--- TEXT TO TRANSLATE ---\n${sourceText}\n--- END ---`
  );
}
