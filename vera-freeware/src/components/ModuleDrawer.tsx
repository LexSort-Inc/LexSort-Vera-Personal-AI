import { useState } from "react";
import { VeraModule } from "../types/module";

interface Props {
  modulesList: VeraModule[];
  activeModule: string;
  onSelectModule: (moduleId: string) => void;
  onClose: () => void;
  isPro?: boolean;
}

export default function ModuleDrawer({ modulesList, activeModule, onSelectModule, onClose, isPro = false }: Props) {
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"all" | "installed" | "beta" | "soon">("all");

  const filtered = modulesList.filter((mod) => {
    // 1. Filter by tab status mapping
    if (filterTab === "installed" && mod.status !== "installed") return false;
    if (filterTab === "beta" && mod.status !== "beta" && mod.status !== "design") return false;
    if (filterTab === "soon" && mod.status !== "soon") return false;

    // 2. Filter by search keyword
    const term = search.toLowerCase();
    if (term) {
      const matchName = mod.display_name.toLowerCase().includes(term);
      const matchDesc = mod.description.toLowerCase().includes(term);
      return matchName || matchDesc;
    }

    return true;
  });

  return (
    <aside className="modules-drawer">
      <header className="history-drawer-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <span className="history-drawer-title" style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>Workspace Modules</span>
        <button
          onClick={onClose}
          title="Close drawer"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "14px",
            padding: "4px 8px",
            borderRadius: "4px"
          }}
        >
          ✕
        </button>
      </header>

      {/* Search Input */}
      <div style={{ padding: "12px 16px 8px 16px", flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Search modules..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text)",
            padding: "8px 12px",
            fontSize: "13px",
            outline: "none",
            boxSizing: "border-box"
          }}
        />
      </div>

      {/* Tab Filter Pills */}
      <div className="modules-drawer-tabs" style={{ display: "flex", gap: "4px", padding: "8px 16px", borderBottom: "1px solid var(--border)", overflowX: "auto", flexShrink: 0 }}>
        {([
          { id: "all", label: "All" },
          { id: "installed", label: "Installed" },
          { id: "beta", label: "Beta & Preview" },
          { id: "soon", label: "Soon" }
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterTab(tab.id)}
            style={{
              background: filterTab === tab.id ? "var(--accent)" : "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: filterTab === tab.id ? "#ffffff" : "var(--text-muted)",
              fontSize: "11px",
              fontWeight: 600,
              padding: "4px 8px",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.2s"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scrollable list */}
      <div
        className="modules-drawer-list"
        style={{
          flexGrow: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }}
      >
        {filtered.length > 0 ? (
          filtered.map((mod) => {
            let badgeColor = "var(--text-muted)";
            let badgeBg = "rgba(255, 255, 255, 0.05)";
            let badgeText = "";

            if (mod.isFree) {
              badgeColor = "var(--green)";
              badgeBg = "rgba(34, 197, 94, 0.1)";
              badgeText = "Free";
            } else if (!isPro && mod.status !== "soon") {
              badgeColor = "var(--accent)";
              badgeBg = "rgba(91, 106, 245, 0.1)";
              badgeText = "🔒 VERA Pro";
            } else if (mod.status === "installed") {
              badgeColor = "var(--green)";
              badgeBg = "rgba(34, 197, 94, 0.1)";
              badgeText = "Installed";
            } else if (mod.status === "beta") {
              badgeColor = "#3b82f6";
              badgeBg = "rgba(59, 130, 246, 0.1)";
              badgeText = "Beta";
            } else if (mod.status === "design") {
              badgeColor = "#f97316";
              badgeBg = "rgba(249, 115, 22, 0.1)";
              badgeText = "Design Preview";
            } else if (mod.status === "soon") {
              badgeColor = "var(--text-muted)";
              badgeBg = "rgba(255, 255, 255, 0.05)";
              badgeText = "Soon";
            }

            const isSelected = activeModule === mod.id;

            const handleClick = () => {
              if (mod.status === "soon") {
                alert(`${mod.display_name} is coming soon to VERA Pro Suite!`);
                return;
              }
              onSelectModule(mod.id);
            };

            return (
              <div
                key={mod.id}
                className={`module-drawer-card ${isSelected ? "module-drawer-card--selected" : ""}`}
                onClick={handleClick}
                style={{
                  background: isSelected ? "rgba(91, 106, 245, 0.05)" : "rgba(255, 255, 255, 0.01)",
                  border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "12px",
                  cursor: "pointer",
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                  boxSizing: "border-box"
                }}
              >
                <span style={{ fontSize: "24px", display: "block", userSelect: "none" }}>{mod.icon}</span>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", gap: "8px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {mod.display_name}
                    </span>
                    <span
                      style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        color: badgeColor,
                        background: badgeBg,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: `1px solid ${badgeColor}33`,
                        whiteSpace: "nowrap",
                        flexShrink: 0
                      }}
                    >
                      {badgeText}
                    </span>
                  </div>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0, lineHeight: 1.4 }}>
                    {mod.description}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
            No modules match your query.
          </div>
        )}
      </div>
    </aside>
  );
}
