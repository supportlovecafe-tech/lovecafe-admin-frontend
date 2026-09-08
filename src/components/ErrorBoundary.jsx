import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught runtime error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0f',
          color: '#fff',
          padding: '24px',
          textAlign: 'center',
          fontFamily: 'sans-serif'
        }}>
          <div style={{
            background: 'rgba(255, 47, 146, 0.08)',
            border: '1px solid rgba(255, 47, 146, 0.3)',
            borderRadius: '20px',
            padding: '40px',
            maxWidth: '500px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#ff2f92', marginBottom: '12px' }}>
              Something went wrong
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', marginBottom: '24px', lineHeight: 1.6 }}>
              {this.state.error?.message || 'An unexpected error occurred while rendering the page.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                background: 'linear-gradient(135deg, #ff2f92, #ff6b6b)',
                color: '#fff',
                border: 'none',
                padding: '14px 28px',
                borderRadius: '12px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(255,47,146,0.3)'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
