'use client';

import React from 'react';

interface ConfirmModalProps {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmModal({ message, onCancel, onConfirm }: ConfirmModalProps) {
  return (
    <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="mb">
        <p style={{ margin: '0 0 14px', fontSize: 16 }}>{message}</p>
        <div className="row" style={{ display: 'flex', gap: 8 }}>
          <button className="bad grow" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
          <button className="pri grow" onClick={onConfirm} style={{ flex: 1 }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

