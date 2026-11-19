// src/components/ErrorBoundary.jsx — last-resort screen so a render error never leaves a blank page.
import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Render error', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>Something went wrong</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: '#6b7280' }}>
            Reload to try again. / Algo salió mal. Vuelve a cargar la página.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 20, width: '100%', padding: '12px 0', borderRadius: 12, border: 0, background: '#d4a017', color: '#fff', fontWeight: 600, fontSize: 15 }}
          >
            Reload / Recargar
          </button>
        </div>
      </div>
    )
  }
}
