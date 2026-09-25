import React, { Component } from 'react';
import { supabase } from './lib/supabaseClient.js';

export default class AccessibilityErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorLogId: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  async componentDidCatch(error, errorInfo) {
    console.error('♿ [ACCESSIBILITY INTERCEPT]:', error.message);
    try {
      const { data } = await supabase.from('external_api_logs').insert([{
        endpoint_path: window.location.pathname,
        channel_source: 'frontend_ui_matrix',
        payload_summary: `UI Crash: ${error.message}. Stack: ${errorInfo.componentStack.slice(0, 150)}`,
        sync_lag_ms: 0,
        http_status_code: 500
      }]).select('id').maybeSingle();
      if (data) this.setState({ errorLogId: data.id });
    } catch (err) {
      console.error(err.message);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" style={{ padding: '40px', maxWidth: '600px', margin: '50px auto', fontFamily: 'sans-serif' }}>
          <h1>Interface Fallback</h1>
          <p>The panel encountered a layout barrier. AI operations are reviewing metrics.</p>
          {this.state.errorLogId && <p>Incident Code: {this.state.errorLogId.slice(0,8)}</p>}
          <button onClick={() => window.location.reload()}>Refresh Interface</button>
        </div>
      );
    }
    return this.props.children;
  }
}
