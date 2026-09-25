import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function OrderChatComponent({ orderId, currentUserName, currentUserRole }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const ledgerEndRef = useRef(null);

  useEffect(() => {
    // Resolve current authenticated ID safely to anchor chat orientation
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  useEffect(() => {
    if (!orderId) return;

    async function loadChatHistory() {
      const { data, error } = await supabase
        .from('order_messages')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });
      if (!error) setMessages(data || []);
    }

    loadChatHistory();

    // FIXED: Formatted the realtime filter parameter securely matching Postgres constraints
    const channel = supabase
      .channel(`chat-${orderId}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'order_messages', 
          filter: `order_id=eq.${orderId}` 
        },
        (payload) => {
          // Avoid duplicate appends if client updates local state optimistically
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  useEffect(() => {
    ledgerEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;
    setSending(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expired.');

      const { error } = await supabase.from('order_messages').insert([
        {
          order_id: orderId,
          sender_id: user.id,
          sender_name: currentUserName,
          sender_role: currentUserRole,
          message_text: newMessage.trim()
        }
      ]);

      if (error) throw error;
      setNewMessage('');
    } catch (err) {
      alert(`Message failed: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div>
          <span className="admin-tag">Ecosystem Shared Chat</span>
          <h3>Order Coordination Room</h3>
          <small>Order: #{orderId ? orderId.slice(0, 8) : 'N/A'}</small>
        </div>
        <span className="live-badge">● Live</span>
      </div>
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-state-box">No messages yet. Start the conversation!</div>
        ) : (
          messages.map((msg, i) => {
            // FIXED: Identity mapping anchored safely to UUID instead of text strings
            const isMe = msg.sender_id === currentUserId;
            return (
              <div key={msg.id || i} className={`chat-bubble-wrapper ${isMe ? 'me' : 'them'}`}>
                <small className="chat-sender">
                  {msg.sender_name} · <span className="role-text">{msg.sender_role}</span>
                </small>
                <div className={`chat-bubble ${isMe ? 'me' : 'them'}`}>
                  {msg.message_text}
                </div>
              </div>
            );
          })
        )}
        <div ref={ledgerEndRef} />
      </div>
      <form onSubmit={handleSend} className="chat-input-bar">
        <input
          type="text"
          placeholder={`Message as ${currentUserName} (${currentUserRole})...`}
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          disabled={sending}
          required
        />
        <button type="submit" disabled={sending || !newMessage.trim()} className="btn-primary">
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
