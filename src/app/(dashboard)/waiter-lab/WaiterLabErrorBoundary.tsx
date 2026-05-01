"use client";

import React from "react";

interface State {
  hasError: boolean;
  error:    Error | null;
}

export class WaiterLabErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-gray-950 p-8 text-center font-mono text-xs">
          <span className="rounded bg-red-900 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-300">
            Lab Error — render exception
          </span>
          <p className="text-sm text-gray-300">
            O Waiter Lab encontrou um erro de renderização.
          </p>
          {this.state.error && (
            <pre className="max-w-lg overflow-auto rounded bg-gray-900 p-3 text-left text-[10px] text-red-400">
              {this.state.error.message}
              {"\n"}
              {this.state.error.stack?.split("\n").slice(1, 5).join("\n")}
            </pre>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded bg-gray-700 px-3 py-2 text-xs text-gray-200 hover:bg-gray-600"
            >
              Reset Lab
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded border border-gray-700 px-3 py-2 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200"
            >
              Reload UI
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
