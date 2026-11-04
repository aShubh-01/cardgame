'use client';

import React from 'react';
import { Player, COL, esc, money } from '@/types/game';

interface DebtModalProps {
  players: Player[];
  debts: Record<string, number>;
  onClose: () => void;
  onSettle: (key: string) => void;
  onSettleAll: () => void;
}

export default function DebtModal({
  players,
  debts,
  onClose,
  onSettle,
  onSettleAll,
}: DebtModalProps) {
  const playerMap = new Map(players.map(p => [p.id, p]));

  // Calculate net balances
  const net: Record<string, number> = {};
  players.forEach(p => { net[p.id] = 0; });
  Object.entries(debts).forEach(([k, a]) => {
    const [from, to] = k.split('|');
    if (from in net) net[from] -= a;
    if (to in net) net[to] += a;
  });

  const validDebts = Object.entries(debts).filter(([k]) =>
    k.split('|').every(id => playerMap.has(id))
  );
  const totalDebt = validDebts.reduce((sum, [, a]) => sum + a, 0);

  const dtAv = (id: string) => {
    const p = playerMap.get(id);
    const col = COL[players.findIndex(x => x.id === id) % COL.length];
    return (
      <div
        className="av"
        style={{
          background: col,
          width: 22,
          height: 22,
          fontSize: 10,
          borderWidth: 1.5,
          boxShadow: 'none',
          display: 'inline-grid',
          margin: 0,
          flex: 'none',
        }}
      >
        {esc((p?.name[0] || '?').toUpperCase())}
      </div>
    );
  };

  return (
    <div className="mdl" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="debt-modal-box">
        {/* Header */}
        <div className="debt-modal-header">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18 }}>
              <span>💸</span> Who Owes Who
            </h2>
            <div className="mut" style={{ fontSize: 12, marginTop: 2 }}>
              Rows indicate who owes money (Debtor) · Columns indicate who receives money (Creditor)
            </div>
          </div>
          <button className="sm" onClick={onClose} style={{ padding: '4px 12px' }}>
            ✕ Close
          </button>
        </div>

        <div className="debt-modal-body">
          {!players.length ? (
            <p className="mut" style={{ margin: '30px 0', textAlign: 'center' }}>
              No players seated at the table yet.
            </p>
          ) : (
            <>
              {/* Summary Toolbar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  {totalDebt > 0 ? (
                    <>
                      <span className="pill" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                        {validDebts.length} pending payment{validDebts.length > 1 ? 's' : ''}
                      </span>
                      <span className="mut">
                        Total circulating:{' '}
                        <b style={{ color: 'var(--gold)', fontSize: 14 }}>{money(totalDebt)}</b>
                      </span>
                    </>
                  ) : (
                    <span style={{ color: '#4ade80', fontWeight: 700 }}>
                      ✓ All square! No pending debts between players.
                    </span>
                  )}
                </div>

                {validDebts.length > 0 && (
                  <button
                    className="sm pri"
                    onClick={onSettleAll}
                    style={{ fontSize: 11.5, padding: '5px 14px', fontWeight: 800 }}
                  >
                    ✓ Mark all as settled
                  </button>
                )}
              </div>

              {/* Debt Matrix Table */}
              <div className="debt-table-wrap">
                <table className="debt-table">
                  <thead>
                    <tr>
                      <th className="dt-corner">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 9.5, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Owes ↓
                          </span>
                          <span style={{ fontSize: 9.5, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            Receives →
                          </span>
                        </div>
                      </th>

                      {players.map(p => (
                        <th key={p.id} className="dt-head-player">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            {dtAv(p.id)}
                            <span style={{ fontWeight: 700 }}>{p.name}</span>
                          </div>
                        </th>
                      ))}

                      <th className="dt-tot-col" style={{ letterSpacing: 0.5, fontSize: 11 }}>
                        TOTAL OWED
                      </th>
                      <th className="dt-net-col" style={{ letterSpacing: 0.5, fontSize: 11 }}>
                        NET BALANCE
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {players.map(rowP => {
                      let rowOwed = 0;
                      return (
                        <tr key={rowP.id}>
                          <td className="dt-player-col">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              {dtAv(rowP.id)}
                              <span style={{ fontWeight: 700 }}>{rowP.name}</span>
                            </div>
                          </td>

                          {players.map(colP => {
                            if (rowP.id === colP.id) {
                              return (
                                <td key={colP.id} className="dt-cell-self" title="Self">
                                  —
                                </td>
                              );
                            }
                            const debtKey = `${rowP.id}|${colP.id}`;
                            const amt = debts[debtKey] || 0;
                            if (amt > 0) {
                              rowOwed += amt;
                              return (
                                <td key={colP.id} className="dt-cell-debt">
                                  <button
                                    type="button"
                                    className="dt-settle-chip"
                                    onClick={() => onSettle(debtKey)}
                                    title={`Click to settle ${money(amt)} from ${rowP.name} to ${colP.name}`}
                                  >
                                    <span className="dt-chip-amt">{money(amt)}</span>
                                    <span className="dt-chip-check">✓</span>
                                  </button>
                                </td>
                              );
                            }
                            return (
                              <td key={colP.id} className="dt-cell-zero">
                                —
                              </td>
                            );
                          })}

                          {/* Total Owed by row player */}
                          <td className="dt-tot-col">
                            <span
                              style={{
                                fontWeight: 800,
                                color: rowOwed > 0 ? '#f87171' : 'var(--mut)',
                              }}
                            >
                              {rowOwed > 0 ? money(rowOwed) : '₹0'}
                            </span>
                          </td>

                          {/* Net Balance of row player */}
                          <td className="dt-net-col">
                            {(() => {
                              const netVal = net[rowP.id] || 0;
                              const isPositive = netVal > 0;
                              const isNegative = netVal < 0;

                              return (
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    fontWeight: 900,
                                    fontSize: 12,
                                    background: isPositive
                                      ? 'rgba(34, 197, 94, 0.15)'
                                      : isNegative
                                      ? 'rgba(239, 68, 68, 0.15)'
                                      : 'transparent',
                                    color: isPositive
                                      ? '#4ade80'
                                      : isNegative
                                      ? '#f87171'
                                      : 'var(--mut)',
                                  }}
                                >
                                  {isPositive ? `+${money(netVal)}` : isNegative ? `−${money(Math.abs(netVal))}` : '₹0'}
                                </span>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  <tfoot>
                    <tr className="dt-footer-row">
                      <td className="dt-player-col" style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--mut)' }}>
                        TOTAL TO RECEIVE
                      </td>

                      {players.map(colP => {
                        let colRec = 0;
                        players.forEach(rowP => {
                          if (rowP.id !== colP.id) {
                            colRec += debts[`${rowP.id}|${colP.id}`] || 0;
                          }
                        });
                        return (
                          <td key={colP.id} className="dt-foot-val">
                            <span
                              style={{
                                fontWeight: 800,
                                color: colRec > 0 ? '#4ade80' : 'var(--mut)',
                              }}
                            >
                              {colRec > 0 ? money(colRec) : '₹0'}
                            </span>
                          </td>
                        );
                      })}

                      <td className="dt-tot-col">
                        <b style={{ color: totalDebt > 0 ? '#f87171' : 'var(--mut)', fontWeight: 800 }}>
                          {money(totalDebt)}
                        </b>
                      </td>

                      <td className="dt-net-col">
                        <span style={{ fontWeight: 800, color: 'var(--mut)' }}>₹0</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
