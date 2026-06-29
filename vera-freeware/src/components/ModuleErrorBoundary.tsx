import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  moduleName: string;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

export class ModuleErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[Module Error Boundary] Exception in dynamic module "${this.props.moduleName}":`, error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, errorMessage: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="em-module-error-fallback" style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "2rem",
          textAlign: "center",
          background: "#0a0a0f",
          color: "#e2e8f0",
          fontFamily: "sans-serif"
        }}>
          <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>⚠️</div>
          <h3 style={{ margin: "0 0 0.5rem 0", color: "#f87171", fontSize: "1.25rem", fontWeight: 600 }}>
            {this.props.moduleName} encountered an error
          </h3>
          <p style={{ color: "#94a3b8", fontSize: "0.85rem", maxWidth: "420px", margin: "0 0 1.5rem 0", fontFamily: "monospace", background: "rgba(0,0,0,0.3)", padding: "0.75rem 1rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)", overflowWrap: "break-word" }}>
            {this.state.errorMessage || 'Unknown rendering error'}
          </p>
          <button 
            onClick={this.handleReload} 
            className="em-btn em-btn--primary"
            style={{ padding: "0.6rem 1.5rem", fontSize: "0.85rem", fontWeight: 600 }}
          >
            🔄 Reload Module
          </button>
          <p style={{ color: "#475569", fontSize: "0.75rem", marginTop: "1rem" }}>
            VERA Chat core remains fully functional.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
