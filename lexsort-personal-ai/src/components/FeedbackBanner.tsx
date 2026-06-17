import { VeraModule } from "../types/module";

interface Props {
  activeModule: string;
  modulesList: VeraModule[];
}

export default function FeedbackBanner({ activeModule, modulesList }: Props) {
  const activeModObj = modulesList.find((m) => m.id === activeModule);
  if (!activeModObj) return null;

  const hasBeta = activeModObj.flags?.includes("beta") || activeModObj.status === "beta";
  const hasDesign = activeModObj.flags?.includes("design_preview") || activeModObj.status === "design";

  if (!hasBeta && !hasDesign) return null;

  const bannerType = hasBeta ? "beta" : "design";
  const label = bannerType === "beta" ? "🧪 Beta Version" : "🎨 Design Preview";
  const bgColor = bannerType === "beta" ? "rgba(59, 130, 246, 0.1)" : "rgba(249, 115, 22, 0.1)";
  const borderColor = bannerType === "beta" ? "#3b82f633" : "#f9731633";
  const textColor = bannerType === "beta" ? "#93c5fd" : "#fdba74";
  const btnColor = bannerType === "beta" ? "#3b82f6" : "#f97316";

  const handleFeedback = () => {
    alert(
      `Thank you for testing the ${activeModObj.display_name} module! Please send any feedback, suggestions, or bug reports to support@lexsort.com.`
    );
  };

  return (
    <div
      style={{
        background: bgColor,
        borderBottom: `1px solid ${borderColor}`,
        padding: "8px 16px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: "12px",
        color: textColor,
        gap: "12px",
        flexShrink: 0,
        zIndex: 5
      }}
    >
      <span>
        <strong>{label}</strong>: <code>{activeModObj.display_name}</code> is currently available for testing. We would love your feedback to refine it before release.
      </span>
      <button
        onClick={handleFeedback}
        style={{
          background: btnColor,
          border: "none",
          borderRadius: "4px",
          color: "#fff",
          padding: "4px 10px",
          fontWeight: 600,
          fontSize: "11px",
          cursor: "pointer",
          transition: "opacity 0.2s"
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        Submit Feedback
      </button>
    </div>
  );
}
