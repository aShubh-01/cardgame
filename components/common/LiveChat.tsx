'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage, COL } from '@/types/game';

interface LiveChatProps {
  messages: ChatMessage[];
  myPlayerId?: string | null;
  isGameOperator?: boolean;
  onSend: (text: string) => Promise<void> | void;
}

const QUICK_REACTIONS = ['👍', '😂', '🔥', '😱', '🤑', 'GG!', 'Nice hand!', 'Hurry up ⏳'];

function timeLabel(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function LiveChat({ messages, myPlayerId, isGameOperator, onSend }: LiveChatProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSeenCount, setLastSeenCount] = useState(messages.length);
  const listRef = useRef<HTMLDivElement>(null);

  const mySenderId = isGameOperator ? '__go__' : myPlayerId;
  const unread = open ? 0 : Math.max(0, messages.length - lastSeenCount);

  // Mark as read while panel is open, auto-scroll to newest message
  useEffect(() => {
    if (open) {
      setLastSeenCount(messages.length);
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      });
    }
  }, [open, messages.length]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await onSend(t);
      setDraft('');
    } finally {
      setSending(false);
    }
  };

  const colorFor = (senderId: string) => {
    if (senderId === '__go__') return '#b45309';
    let h = 0;
    for (let i = 0; i < senderId.length; i++) h = (h * 31 + senderId.charCodeAt(i)) >>> 0;
    return COL[h % COL.length];
  };

  return (
    <>
      <button
        type="button"
        className="chat-fab"
        onClick={() => setOpen(o => !o)}
        title={open ? 'Close table chat' : 'Open table chat'}
        aria-label="Table chat"
      >
        {open ? '✕' : '💬'}
        {unread > 0 && <span className="chat-fab-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="chat-panel" role="dialog" aria-label="Live table chat">
          <div className="chat-head">
            <span>💬 Table Chat</span>
            <span className="chat-live-dot">● LIVE</span>
          </div>

          <div className="chat-list" ref={listRef}>
            {messages.length === 0 ? (
              <div className="chat-empty">No messages yet — say hi to the table 👋</div>
            ) : (
              messages.map((m, idx) => {
                const mine = m.senderId === mySenderId;
                const prev = messages[idx - 1];
                const grouped = prev && prev.senderId === m.senderId && m.createdAt - prev.createdAt < 60000;
                return (
                  <div key={m.id} className={`chat-row ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
                    {!mine && !grouped && (
                      <div className="chat-av" style={{ background: colorFor(m.senderId) }}>
                        {m.senderRole === 'go' ? '🎩' : (m.senderName[0] || '?').toUpperCase()}
                      </div>
                    )}
                    <div className="chat-bubble-wrap">
                      {!grouped && (
                        <div className="chat-meta">
                          <b style={{ color: m.senderRole === 'go' ? 'var(--gold)' : undefined }}>
                            {mine ? 'You' : m.senderName}
                          </b>
                          <span>{timeLabel(m.createdAt)}</span>
                        </div>
                      )}
                      <div className={`chat-bubble ${m.senderRole === 'go' ? 'go' : ''}`}>{m.text}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="chat-quick">
            {QUICK_REACTIONS.map(r => (
              <button key={r} type="button" disabled={sending} onClick={() => send(r)}>
                {r}
              </button>
            ))}
          </div>

          <form
            className="chat-input-row"
            onSubmit={e => {
              e.preventDefault();
              send(draft);
            }}
          >
            <input
              type="text"
              value={draft}
              maxLength={240}
              placeholder="Type a message…"
              onChange={e => setDraft(e.target.value)}
            />
            <button type="submit" className="pri" disabled={!draft.trim() || sending}>
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}

