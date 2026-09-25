import React, { Component } from 'react';
import { supabase } from '../lib/supabaseClient';

export default class AccessibilityErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorLogId: null };
  }

  static getDerivedStateFromError(error) {
    // Intercept client compilation/rendering exceptions and fallback gracefully
    return { hasError: true };
  }

  async componentDidCatch(error, errorInfo) {
    console.error('♿ [ACCESSIBILITY FAILURE INTERCEPTED]:', error.message);
    
    try {
      // 1. Log interface failure parameters directly to our database telemetry layer
      const { data } = await supabase.from('external_api_logs').insert([{
        endpoint_path: window.location.pathname,
        channel_source: 'frontend_ui_matrix',
        payload_summary: `UI Crash: ${error.message}. Stack: ${errorInfo.componentStack.slice(0, 180)}`,
        sync_lag_ms: 0,
        http_status_code: 500
      }]).select('id').maybeSingle();

      if (data) this.setState({ errorLogId: data.id });
    } catch (dbErr) {
      console.error('Failed to log interface failure to database:', dbErr.message);
    }
  }

  render() {
    if (this.state.hasError) {
      // Return a fully semantic, keyboard-navigable fallback layout
      return (
        <div 
          className="accessibility-fallback-screen" 
          role="alert" 
          aria-live="assertive"
          style={{ padding: '40px', maxWidth: '600px', margin: '50px auto', fontFamily: 'sans-serif' }}
        >
          <h1 style={{ fontSize: '24px', color: '#111' }}>
            Interface Navigation Fallback
          </h1>
          <p style={{ color: '#555', fontSize: '16px', lineHeight: '1.6' }}>
            The requested panel encountered a rendering layout barrier. The automated 
            AI team has been alerted and is reviewing the interface metrics.
          </p>
          
          {this.state.errorLogId && (
            <p style={{ fontSize: '13px', color: '#999' }}>
              Incident Reference Code: <kbd style={{ background: '#eee', padding: '2px 6px' }}>{this.state.errorLogId.slice(0,8)}</kbd>
            </p>
          )}

          <button 
            onClick={() => window.location.reload()} 
            style={{
              padding: '12px 24px',
              backgroundColor: '#111',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '15px',
              marginTop: '15px'
            }}
            aria-label="Reload and retry navigating this trade dashboard"
          >
            Refresh Interface Connection
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
