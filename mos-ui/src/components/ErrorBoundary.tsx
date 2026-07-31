import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          color: '#ef4444',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          padding: '2rem',
          zIndex: 99999,
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>应用错误</h1>
          <pre style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            maxWidth: '100%',
            fontSize: '0.875rem',
            color: '#f87171',
            lineHeight: 1.6,
          }}>
            {this.state.error.stack || this.state.error.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
