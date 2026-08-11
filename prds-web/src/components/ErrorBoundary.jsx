import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught an error:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#f8f9ff] px-6">
          <div className="w-full max-w-md rounded-2xl border border-[#d8dadc] bg-white p-8 text-center shadow-xl">
            <p className="text-sm font-black uppercase tracking-[0.16em] text-red-500">
              Something went wrong
            </p>
            <h1 className="mt-2 text-2xl font-black text-[#0d1117]">
              An unexpected error occurred
            </h1>
            <p className="mt-3 text-sm font-medium leading-5 text-neutral-500">
              Your session is still active. Please reload the page to continue.
            </p>
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