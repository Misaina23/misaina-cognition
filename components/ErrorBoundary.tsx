"use client";
import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Misaina Enterprise ErrorBoundary:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-background p-6">
          <div className="max-w-md w-full rounded-2xl border border-border bg-card p-6 shadow-xl text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <AlertTriangle size={24} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-foreground">
                Incident Technique Intercepté
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Le système de confinement des erreurs a isolé cet incident pour préserver l&apos;intégrité de la session et des données institutionnelles.
              </p>
            </div>

            {this.state.error && (
              <div className="rounded-lg bg-muted p-2.5 text-left font-mono text-[11px] text-muted-foreground overflow-x-auto">
                {this.state.error.message || "Erreur d'exécution inattendue"}
              </div>
            )}

            <Button onClick={this.handleReset} className="w-full">
              <RefreshCw size={14} /> Réinitialiser la session
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
