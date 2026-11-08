import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** When this changes (e.g. the page path), a crashed area tries rendering again. */
  resetKey?: string
}

/**
 * Catches a crash in one area (a page, a modal) so the rest of the app keeps working, and shows a
 * friendly message with a retry button. React still needs a class component for this.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Aura screen crashed:', error, info.componentStack)
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex flex-col items-center px-8 py-20 text-center">
        <h2 className="text-xl font-bold">Something went wrong</h2>
        <p className="mt-2 max-w-xs text-sm text-muted">This part of Aura hit a snag. Give it another try.</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-5 h-9 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    )
  }
}
