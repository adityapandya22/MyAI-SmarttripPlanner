import { Component } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * React Error Boundary class component that catches unhandled JavaScript errors
 * in its child component tree, logs the error with context, and displays a friendly
 * fallback UI with retry/reload controls.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error, errorInfo) {
    const section = this.props.section || this.props.name || 'Application'
    console.error(`[ErrorBoundary:${section}] Component rendering crash:`, error, errorInfo)
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, errorInfo)
    }
  }

  handleReset = () => {
    if (typeof this.props.onReset === 'function') {
      this.props.onReset()
    }
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.handleReset)
      }
      if (this.props.fallback) {
        return this.props.fallback
      }

      const section = this.props.section || this.props.name
      const isCompact = Boolean(section && section !== 'Root' && section !== 'App')

      return (
        <div
          role="alert"
          aria-live="assertive"
          className={`flex flex-col items-center justify-center p-6 text-center ${
            isCompact
              ? 'h-full w-full min-h-[200px] rounded-2xl border border-red-200/60 bg-white/95 p-6 shadow-sm backdrop-blur-md'
              : 'min-h-screen w-full bg-ink-50 p-8'
          }`}
        >
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 shadow-sm">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-base font-bold text-ink-900 sm:text-lg">
            {section ? `${section}: Something went wrong` : 'Something went wrong'}
          </h3>
          <p className="mt-1.5 max-w-md text-xs text-ink-500 sm:text-sm">
            {this.state.error?.message || 'An unexpected rendering error occurred in this section.'}
          </p>
          <div className="mt-5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={this.handleReset}
              className="flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-800 shadow-sm transition hover:bg-ink-100 active:scale-95"
            >
              <RotateCcw size={14} />
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-95"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
