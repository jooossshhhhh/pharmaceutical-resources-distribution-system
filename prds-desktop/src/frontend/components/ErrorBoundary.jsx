import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught an error:", error, info);
    this.setState({ errorInfo: info });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#f8f9ff] px-6">
          <div className="w-full max-w-lg rounded-2xl border border-[#d8dadc] bg-white p-8 text-center shadow-xl">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-red-500">
              Something went wrong
            </p>
            <h1 className="mt-2 text-2xl font-black text-[#0d1117]">
              An unexpected error occurred
            </h1>
            <p className="mt-3 text-sm font-medium leading-5 text-neutral-500">
              Your session is still active. Please reload the page to continue.
            </p>

            {this.state.error && (
              <div className="mt-4 max-h-48 overflow-auto rounded-lg bg-red-50 p-3 text-left font-mono text-xs text-red-800 border border-red-200">
                <p className="font-bold">{this.state.error.message || String(this.state.error)}</p>
                {this.state.error.stack && (
                  <pre className="mt-1 whitespace-pre-wrap text-[10px] text-red-600">
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 h-11 rounded-lg bg-emerald-600 px-6 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700"
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}