'use client';

import React from 'react';
import { HistEntry, money } from '@/types/game';

interface RoundHistoryProps {
  history: HistEntry[];
}

export default function RoundHistory({ history }: RoundHistoryProps) {
  return (
    <footer id="foot">
      <div className="fh">
        <h2 style={{ margin: '0 0 10px', border: 'none', padding: 0 }}>📜 Round history</h2>
        {history.length ? (
          <div className="hs">
            {history.slice(0, 16).map((x, i) => {
              const roundPot =
                x.pot != null
                  ? x.pot
                  : x.got != null
                  ? x.got + (x.pays?.reduce((s, p) => s + (p.amt || 0), 0) || 0)
                  : 0;

              return (
                <div key={i} className="hc" style={{ minWidth: 185 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 4,
                    }}
                  >
                    <span className="hn">Round #{x.no}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 900,
                        color: 'var(--gold)',
                        background: 'rgba(244,195,79,0.15)',
                        border: '1px solid rgba(244,195,79,0.3)',
                        padding: '1px 6px',
                        borderRadius: 5,
                      }}
                    >
                      Pot {money(roundPot)}
                    </span>
                  </div>
                  <div className="hw">
                    🏆 {x.winner ? String(x.winner).replace(/&amp;/g, '&') : 'Winner'}
                  </div>
                  <div className="hg pos">
                    +{money(x.got !== undefined ? x.got : roundPot)}{' '}
                    <span style={{ fontSize: 10.5, opacity: 0.7, fontWeight: 600 }}>net</span>
                  </div>
                  <div className="mut" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.3 }}>
                    {(x.pays || [])
                      .map(p => `${p.name ? String(p.name).replace(/&amp;/g, '&') : p.name} −${money(p.amt)}`)
                      .join(' · ')}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mut" style={{ margin: 0 }}>Finished rounds will appear here.</p>
        )}
      </div>
    </footer>
  );
}

