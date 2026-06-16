/**
 * SupportPanel.tsx
 * Community hub, in-app FAQ, pre-filled bug report (opens GitHub Issues), and
 * feedback form (posts to Discord webhook via Netlify function).
 *
 * Used by both VERA Freeware and VERA Pro.
 *
 * Props:
 *   onClose        — called when the panel should close
 *   appName        — "VERA Freeware" | "VERA Pro"
 *   diagnosticText — optional pre-generated diagnostic info to pre-fill
 *   isPro          — true if running in Pro mode
 */

import { useState, useCallback, useMemo } from "react";
import "./SupportPanel.css";

// ─── Config ──────────────────────────────────────────────────────────────────
const DISCORD_URL    = "https://discord.gg/kpZ3hWyAaq";
const REDDIT_URL     = "https://www.reddit.com/r/LexSort/";
const GITHUB_URL     = "https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/issues/new";
const FEEDBACK_ENDPOINT = "https://lexsort.com/api/feedback"; // Netlify function

const BUG_CATEGORIES = [
  "App won't start / crashes on launch",
  "AI model not responding",
  "Slow inference / high RAM usage",
  "Download / install error",
  "UI / display issue",
  "Module error",
  "Other",
];

interface FAQItem {
  q: string;
  a: string;
  category: "licensing" | "llm" | "privacy" | "troubleshooting";
}

const FAQ_ITEMS: FAQItem[] = [
  {
    category: "licensing",
    q: "Does VERA Pro require an active internet connection?",
    a: "No. VERA Pro operates 100% locally. Downloading an LLM model requires a one-time connection, but after that, all AI chat inference, database indexing, and cryptographic license signature checks run completely offline."
  },
  {
    category: "licensing",
    q: "Can I use my Pro subscription on multiple computers?",
    a: "No. A single active subscription is for one (1) desktop computer. However, when the LexSort-GO Companion module launches, you will be permitted to pair exactly one (1) mobile device over local Wi-Fi."
  },
  {
    category: "llm",
    q: "Why is the AI model slow to respond?",
    a: "VERA runs LLMs locally on your device's CPU, GPU, or unified memory. Inference speed is dictated entirely by your local hardware resources. If the response is sluggish, try closing other memory-heavy applications or selecting a lighter model (like Qwen 2.5 1.5B) under VERA Settings."
  },
  {
    category: "privacy",
    q: "Where are my chat logs and keys stored?",
    a: "All chat logs, conversation histories, and local SMTP composition parameters are stored locally on your machine inside the encrypted configuration folder (~/.lexsort). No data is ever sent to LexSort or third-party servers."
  },
  {
    category: "privacy",
    q: "Does LexSort collect telemetry or tracking data?",
    a: "Absolutely not. LexSort was founded on a strict off-grid, 0% data collection commitment. VERA collects zero telemetry, zero analytics, zero crash reports, and zero personal information of any kind."
  },
  {
    category: "troubleshooting",
    q: "The AI model fails to download or fails to load on boot. What do I do?",
    a: "Verify that Ollama is running on port 11434 and that you have at least 10GB of free disk space. If the connection fails, restart VERA or click 'Retry Boot' on the startup screen to re-initiate the inference server binding."
  },
  {
    category: "troubleshooting",
    q: "How do I activate my VERA Pro license key?",
    a: "Go to Settings → Pro License, paste your cryptographic key (which starts with 'VERA-PRO-'), and click Activate. The key signature is validated 100% locally on your machine using Ed25519 offline signature checks."
  }
];

const CATEGORIES_MAP = {
  all: "All Topics",
  licensing: "🔑 Licensing",
  llm: "🧠 Models & Speed",
  privacy: "🔒 Privacy & Data",
  troubleshooting: "🛠️ Troubleshooting",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Opens a URL: tries Tauri opener, falls back to an invisible anchor click */
export async function openExternalUrl(url: string) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    // Fallback: create an invisible anchor and programmatically click it.
    // This works inside Tauri's webview without the opener plugin.
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "community" | "faq" | "bug" | "feedback";

interface Props {
  onClose:        () => void;
  appName?:       string;
  diagnosticText?: string;
  isPro?:         boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SupportPanel({
  onClose,
  appName       = "VERA Freeware",
  diagnosticText = "",
  isPro         = false,
}: Props) {
  const [tab, setTab] = useState<Tab>("community");

  const parsedInfo = useMemo(() => {
    let version = "1.0.0";
    let model = "unknown";
    let ram = "unknown";
    
    if (diagnosticText) {
      const verMatch = diagnosticText.match(/- \*\*VERA Version\*\*:\s*([^\n]+)/i);
      const modelMatch = diagnosticText.match(/- \*\*Selected Model\*\*:\s*([^\n]+)/i);
      const ramMatch = diagnosticText.match(/- \*\*RAM Detected\*\*:\s*([\d.]+)/i) || diagnosticText.match(/- \*\*RAM Detected\*\*:\s*([^\n]+)/i);
      
      if (verMatch) version = verMatch[1].trim();
      if (modelMatch) model = modelMatch[1].trim().split(" (")[0];
      if (ramMatch) ram = ramMatch[1].trim();
    }
    
    return { version, model, ram };
  }, [diagnosticText]);

  // FAQ state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<keyof typeof CATEGORIES_MAP>("all");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Bug report state
  const [bugCategory, setBugCategory] = useState(BUG_CATEGORIES[0]);
  const [bugDesc, setBugDesc]         = useState("");
  const [bugSending, setBugSending]   = useState(false);
  const [bugStatus, setBugStatus]     = useState<"idle"|"ok"|"err">("idle");

  // Feedback state
  const [stars, setStars]               = useState(0);
  const [hoverStar, setHoverStar]       = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackStatus, setFeedbackStatus]   = useState<"idle"|"ok"|"err">("idle");

  // ── Community actions ─────────────────────────────────────────────────────

  const joinDiscord = () => openExternalUrl(DISCORD_URL);
  const joinReddit  = () => openExternalUrl(REDDIT_URL);

  // ── FAQ filtering ─────────────────────────────────────────────────────────

  const filteredFAQs = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
      const matchesQuery =
        item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.a.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [searchQuery, selectedCategory]);

  const toggleFAQ = (index: number) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  // ── Bug report — submits to Discord Forum via Netlify function ────────────

  const submitBugToDiscord = useCallback(async () => {
    if (!bugDesc.trim()) {
      alert("Please describe the issue before submitting.");
      return;
    }
    setBugSending(true);
    setBugStatus("idle");

    try {
      // Extract system details from diagnosticText if possible
      let platform = "unknown";
      let ramGb = null;
      let freeStorageGb = null;
      let hasNvidiaGpu = false;

      if (diagnosticText) {
        const platformMatch = diagnosticText.match(/- \*\*OS Platform\*\*:\s*([^\n]+)/i);
        const ramMatch = diagnosticText.match(/- \*\*RAM Detected\*\*:\s*([\d.]+)\s*GB/i);
        const storageMatch = diagnosticText.match(/- \*\*Free Storage\*\*:\s*([\d.]+)\s*GB/i);
        const gpuMatch = diagnosticText.match(/- \*\*NVIDIA GPU\*\*:\s*(Yes|True)/i);
        if (platformMatch) platform = platformMatch[1].trim();
        if (ramMatch) ramGb = parseFloat(ramMatch[1]);
        if (storageMatch) freeStorageGb = parseFloat(storageMatch[1]);
        if (gpuMatch) hasNvidiaGpu = true;
      }

      const res = await fetch("https://lexsort.com/.netlify/functions/submit-bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          ramGb,
          freeStorageGb,
          hasNvidiaGpu,
          category: bugCategory,
          description: bugDesc,
          diagnostics: diagnosticText,
          appName,
          isPro,
        }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      
      setBugStatus("ok");
      setBugDesc("");
    } catch (err) {
      console.error(err);
      setBugStatus("err");
    } finally {
      setBugSending(false);
    }
  }, [bugCategory, bugDesc, diagnosticText, appName, isPro]);

  const openGitHubIssue = useCallback(async () => {
    setBugSending(true);
    setBugStatus("idle");

    const body = [
      `## Category\n${bugCategory}`,
      `## Description\n${bugDesc || "(no description provided)"}`,
      `## Diagnostic Info\n\`\`\`\n${diagnosticText || "Not available"}\n\`\`\``,
      `## App\n${appName}${isPro ? " (Pro)" : " (Freeware)"}`,
    ].join("\n\n");

    const params = new URLSearchParams({
      title:    `[${bugCategory}] User-reported issue`,
      body,
      labels:   isPro ? "bug,vera-pro" : "bug,vera-freeware",
    });

    const githubUrl = `${GITHUB_URL}?${params.toString()}`;

    try {
      await openExternalUrl(githubUrl);
    } catch (err) {
      console.error(err);
    } finally {
      setBugSending(false);
    }
  }, [bugCategory, bugDesc, diagnosticText, appName, isPro]);

  // ── Feedback — posts to Netlify function → Discord webhook ────────────────

  const submitFeedback = useCallback(async () => {
    if (!feedbackText.trim() && stars === 0) return;
    setFeedbackSending(true);
    setFeedbackStatus("idle");

    try {
      const res = await fetch(FEEDBACK_ENDPOINT, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app:     appName,
          rating:  stars,
          message: feedbackText.trim(),
          version: "1.1.0",
        }),
      });

      if (!res.ok) throw new Error(`Server ${res.status}`);
      setFeedbackStatus("ok");
      setStars(0);
      setFeedbackText("");
    } catch {
      // If the Netlify function is unreachable, fall back gracefully
      setFeedbackStatus("err");
    } finally {
      setFeedbackSending(false);
    }
  }, [stars, feedbackText, appName]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="sp-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Support & Community"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sp-panel">

        {/* Header */}
        <div className="sp-header">
          <div className="sp-header-left">
            <h2 className="sp-title">Support & Community</h2>
            <p className="sp-subtitle">{appName} · Built by LexSort Inc.</p>
          </div>
          <button className="sp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Tab bar */}
        <div className="sp-tabs" role="tablist">
          {(["community", "faq", "bug", "feedback"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              className={`sp-tab${tab === t ? " sp-tab--active" : ""}`}
              onClick={() => setTab(t)}
              aria-selected={tab === t}
            >
              {t === "community" && "🌐 Community"}
              {t === "faq"       && "📖 FAQ"}
              {t === "bug"       && "🐛 Bug Report"}
              {t === "feedback"  && "⭐ Feedback"}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="sp-body">

          {/* ── Community tab ── */}
          {tab === "community" && (
            <div className="sp-community-grid">
              <button className="sp-community-card" onClick={joinDiscord}>
                <div className="sp-community-icon sp-community-icon--discord">💬</div>
                <div className="sp-community-text">
                  <p className="sp-community-name">Discord Server</p>
                  <p className="sp-community-desc">discord.gg/kpZ3hWyAaq · Live community support</p>
                </div>
                <span className="sp-community-arrow">Open</span>
              </button>

              <button className="sp-community-card" onClick={joinReddit}>
                <div className="sp-community-icon sp-community-icon--reddit">🔴</div>
                <div className="sp-community-text">
                  <p className="sp-community-name">Reddit — r/LexSort</p>
                  <p className="sp-community-desc">r/LexSort · Tips and showcase</p>
                </div>
                <span className="sp-community-arrow">Open</span>
              </button>

              <button
                className="sp-community-card"
                onClick={() => {
                  navigator.clipboard.writeText("support@lexsort.com");
                  alert("Support email copied to clipboard!");
                }}
              >
                <div className="sp-community-icon sp-community-icon--email">✉</div>
                <div className="sp-community-text">
                  <p className="sp-community-name">Email Support</p>
                  <p className="sp-community-desc">support@lexsort.com · Copy to clipboard</p>
                </div>
                <span className="sp-community-arrow">Copy</span>
              </button>

              <p className="sp-divider-label">Help & Documentation</p>

              <button
                className="sp-community-card"
                onClick={() => openExternalUrl("https://lexsort.com/faq.html")}
              >
                <div className="sp-community-icon sp-community-icon--github">📖</div>
                <div className="sp-community-text">
                  <p className="sp-community-name">FAQ & Troubleshooting</p>
                  <p className="sp-community-desc">Model won't load? App crashes? Start here.</p>
                </div>
                <span className="sp-community-arrow">→</span>
              </button>

              <button
                className="sp-community-card"
                onClick={() => openExternalUrl("https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI")}
              >
                <div className="sp-community-icon sp-community-icon--github">🐙</div>
                <div className="sp-community-text">
                  <p className="sp-community-name">GitHub Repository</p>
                  <p className="sp-community-desc">Open source. Read the code, watch releases, star the repo.</p>
                </div>
                <span className="sp-community-arrow">→</span>
              </button>
            </div>
          )}

          {/* ── FAQ Tab ── */}
          {tab === "faq" && (
            <div className="sp-faq-container">
              {/* Search Bar */}
              <div className="sp-faq-search-bar">
                <input
                  type="text"
                  className="sp-input sp-faq-search-input"
                  placeholder="Search help topics..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setExpandedIndex(null);
                  }}
                />
              </div>

              {/* Categories list */}
              <div className="sp-faq-categories">
                {(Object.keys(CATEGORIES_MAP) as Array<keyof typeof CATEGORIES_MAP>).map((cat) => (
                  <button
                    key={cat}
                    className={`sp-faq-category-btn${selectedCategory === cat ? " sp-faq-category-btn--active" : ""}`}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setExpandedIndex(null);
                    }}
                  >
                    {CATEGORIES_MAP[cat]}
                  </button>
                ))}
              </div>

              {/* Accordion list */}
              <div className="sp-faq-list">
                {filteredFAQs.length > 0 ? (
                  filteredFAQs.map((item, idx) => (
                    <div
                      key={idx}
                      className={`sp-faq-item${expandedIndex === idx ? " sp-faq-item--expanded" : ""}`}
                    >
                      <button
                        className="sp-faq-question-btn"
                        onClick={() => toggleFAQ(idx)}
                      >
                        <span>{item.q}</span>
                        <span className="sp-faq-arrow">▶</span>
                      </button>
                      {expandedIndex === idx && (
                        <div className="sp-faq-answer">
                          {item.a}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="sp-faq-empty">
                    No matching topics found. Try typing another search term.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Bug Report tab ── */}
          {tab === "bug" && (
            <div className="sp-bug-form">
              <p style={{ fontSize: "0.83rem", color: "#64748b", margin: "0 0 0.5rem" }}>
                Submit your report directly to our Discord Support Forum. OS and RAM info will be auto-tagged to help solve issues faster. You can also open a GitHub issue as a fallback.
              </p>

              <div className="sp-field">
                <label className="sp-label">Category</label>
                <select
                  className="sp-select"
                  value={bugCategory}
                  onChange={(e) => setBugCategory(e.target.value)}
                >
                  {BUG_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="sp-field">
                <label className="sp-label">
                  Describe the issue <span className="sp-label-hint">(required for Discord submit)</span>
                </label>
                <textarea
                  className="sp-textarea"
                  rows={4}
                  placeholder="What happened? What were you doing when it occurred?"
                  value={bugDesc}
                  onChange={(e) => setBugDesc(e.target.value)}
                />
              </div>

              {diagnosticText && (
                <div className="sp-field">
                  <label className="sp-label">Auto-attached diagnostic info</label>
                  <div className="sp-diag-block">{diagnosticText}</div>
                </div>
              )}

              {bugStatus === "ok" && (
                <div className="sp-alert sp-alert--success">
                  ✅ Bug report successfully submitted to our Discord Support Forum! Feel free to check the #bug-reports channel.
                </div>
              )}
              {bugStatus === "err" && (
                <div className="sp-alert sp-alert--error">
                  ⚠ Submission failed. Please verify your internet connection or join Discord manually to post.
                </div>
              )}

              <div className="sp-actions" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <button className="sp-btn sp-btn--ghost" onClick={onClose} style={{ marginRight: "auto" }}>Cancel</button>
                <button
                  className="sp-btn sp-btn--ghost"
                  onClick={openGitHubIssue}
                  disabled={bugSending}
                  style={{ border: "1px solid var(--border)" }}
                >
                  🐙 Open GitHub Issue
                </button>
                <button
                  className="sp-btn sp-btn--primary"
                  onClick={submitBugToDiscord}
                  disabled={bugSending}
                >
                  {bugSending
                    ? <><span className="sp-spinner" /> Submitting…</>
                    : "📤 Submit to Discord"}
                </button>
              </div>
            </div>
          )}

          {/* ── Feedback tab ── */}
          {tab === "feedback" && (
            <div className="sp-feedback-form">
              <p style={{ fontSize: "0.83rem", color: "#64748b", margin: "0 0 0.5rem" }}>
                Your feedback goes directly to our Discord and Reddit — no account required. All feedback is anonymous.
              </p>

              <div className="sp-field">
                <label className="sp-label">How would you rate VERA?</label>
                <div className="sp-stars" role="group" aria-label="Star rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      className={`sp-star${(hoverStar || stars) >= n ? " sp-star--active" : ""}`}
                      onClick={() => setStars(n)}
                      onMouseEnter={() => setHoverStar(n)}
                      onMouseLeave={() => setHoverStar(0)}
                      aria-label={`${n} star${n !== 1 ? "s" : ""}`}
                    >
                      ⭐
                    </button>
                  ))}
                  {stars > 0 && (
                    <span style={{ fontSize: "0.78rem", color: "#94a3b8", alignSelf: "center", marginLeft: "0.5rem" }}>
                      {["", "Needs work", "Below average", "Good", "Great", "Excellent!"][stars]}
                    </span>
                  )}
                </div>
              </div>

              <div className="sp-field">
                <label className="sp-label">
                  Your thoughts <span className="sp-label-hint">(optional)</span>
                </label>
                <textarea
                  className="sp-textarea"
                  rows={4}
                  placeholder="What do you love? What should we improve? Feature requests? We read every message."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                />
              </div>

              {feedbackStatus === "ok" && (
                <div className="sp-alert sp-alert--success">
                  ✅ Thank you! Your feedback was sent to our Discord and Reddit.
                </div>
              )}
              {feedbackStatus === "err" && (
                <div className="sp-alert sp-alert--error">
                  ⚠ Couldn't reach server. Join our{" "}
                  <button
                    style={{ background: "none", border: "none", color: "#c4b5fd", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                    onClick={joinDiscord}
                  >
                    Discord
                  </button>{" "}
                  and share your feedback there directly.
                </div>
              )}

              <div className="sp-actions">
                <button className="sp-btn sp-btn--ghost" onClick={onClose}>Cancel</button>
                <button
                  className="sp-btn sp-btn--primary"
                  onClick={submitFeedback}
                  disabled={feedbackSending || (stars === 0 && !feedbackText.trim())}
                >
                  {feedbackSending
                    ? <><span className="sp-spinner" /> Sending…</>
                    : "⭐ Send Feedback"}
                </button>
              </div>
            </div>
          )}

          {/* Privacy Notice Banner */}
          <div className="sp-privacy-notice">
            <span className="sp-privacy-lock">🔒</span>
            <div>
              <strong>Privacy Commitment:</strong> VERA does not collect, track, or store any personal data or usage logs from this support interface. Bug reports and diagnostics are compiled locally and only sent when manually submitted by you.
            </div>
          </div>

          {/* System Info Footer */}
          <div className="sp-footer-info" style={{ marginTop: "16px", padding: "12px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-muted)" }}>
            <span>VERA v{parsedInfo.version} · {isPro ? "Pro Edition" : "Freeware Edition"}</span>
            <span>Model: {parsedInfo.model} · {parsedInfo.ram} RAM</span>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(`VERA v${parsedInfo.version} (${isPro ? "Pro Edition" : "Freeware Edition"})\nModel: ${parsedInfo.model}\nRAM: ${parsedInfo.ram} RAM`);
                alert("System info copied to clipboard!");
              }}
              style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "11px", padding: 0 }}
            >
              Copy Info
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
