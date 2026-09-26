import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

// A dummy component that throws an error when trigger=true
function ThrowingComponent({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error('Test crash in child component')
  }
  return <div>Normal Content</div>
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy

  beforeEach(() => {
    // Suppress React's intentional console.error for expected test boundary catches
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    consoleErrorSpy.mockRestore()
  })

  it('renders children when no error is thrown', () => {
    render(
      <ErrorBoundary section="TestSection">
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Normal Content')).toBeTruthy()
  })

  it('catches render errors and displays friendly fallback UI with section name', () => {
    render(
      <ErrorBoundary section="Map">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Map: Something went wrong')).toBeTruthy()
    expect(screen.getByText('Test crash in child component')).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy()

    // Confirms console.error was called with section tag
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ErrorBoundary:Map]'),
      expect.any(Error),
      expect.anything(),
    )
  })

  it('renders custom fallback function if provided', () => {
    render(
      <ErrorBoundary
        section="Custom"
        fallback={(error, reset) => (
          <div>
            <span>Custom Fallback: {error.message}</span>
            <button onClick={reset}>Custom Reset</button>
          </div>
        )}
      >
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Custom Fallback: Test crash in child component')).toBeTruthy()
    expect(screen.getByRole('button', { name: /custom reset/i })).toBeTruthy()
  })

  it('calls onReset callback when Try Again is clicked', () => {
    const onReset = vi.fn()
    render(
      <ErrorBoundary section="Test" onReset={onReset}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    )

    const tryAgainBtn = screen.getByRole('button', { name: /try again/i })
    fireEvent.click(tryAgainBtn)

    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
