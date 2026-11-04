/**
 * Poker Main Pot & Side Pot Management
 *
 * Implements real-world poker rules for pot splitting when players go all-in
 * with differing chip contributions or fold.
 */

export interface Pot {
  id: string; // 'main' | 'side-1' | 'side-2' ...
  name: string; // 'Main Pot' | 'Side Pot 1' | 'Side Pot 2' ...
  amount: number; // In rupees
  eligiblePlayerIds: string[]; // Active players eligible to win this pot
  contributorIds: string[]; // Players who contributed chips to this pot
  tierCap: number; // Cumulative contribution cutoff for this pot
}

export interface PotCalculationResult {
  pots: Pot[];
  totalPot: number;
}

export interface PotPayout {
  potId: string;
  potName: string;
  amount: number;
  winnerIds: string[];
  shares: Record<string, number>; // playerId -> chips won from this pot
}

export interface PayoutSummary {
  payouts: PotPayout[];
  totalPlayerWins: Record<string, number>; // playerId -> total chips won across all pots
  pays: { name: string; amt: number }[]; // Summary of deductions / payouts
}

/**
 * Normalizes folded input to a Set of player IDs.
 */
function normalizeFolded(
  folded: Record<string, any> | string[] | Set<string> = []
): Set<string> {
  if (folded instanceof Set) return folded;
  if (Array.isArray(folded)) return new Set(folded);
  const s = new Set<string>();
  for (const [k, v] of Object.entries(folded)) {
    if (v) s.add(k);
  }
  return s;
}

/**
 * Dynamically calculates the Main Pot and all Side Pots based on player contributions.
 *
 * Folded players' chips remain in the pot, but folded players are never eligible to win.
 * Pots with identical eligible player sets are consolidated so players don't face
 * redundant side pots.
 *
 * Invariant: sum of all pot amounts === total contributions.
 */
export function calculatePots(
  contributions: Record<string, number>,
  folded: Record<string, any> | string[] | Set<string> = []
): PotCalculationResult {
  const foldedSet = normalizeFolded(folded);
  const seedAmount = Math.max(0, Number(contributions['__pot_seed__'] || 0));

  // Filter out non-positive player contributions (excluding __pot_seed__)
  const validEntries = Object.entries(contributions).filter(
    ([id, amt]) => id !== '__pot_seed__' && (amt || 0) > 0
  );
  const playerTotalPot = validEntries.reduce((sum, [, amt]) => sum + amt, 0);
  const totalPot = playerTotalPot + seedAmount;

  const allNonFoldedPlayers = Object.keys(contributions).filter(
    id => id !== '__pot_seed__' && !foldedSet.has(id)
  );

  if (totalPot === 0) {
    return {
      pots: [
        {
          id: 'main',
          name: 'Main Pot',
          amount: 0,
          eligiblePlayerIds: [],
          contributorIds: [],
          tierCap: 0,
        },
      ],
      totalPot: 0,
    };
  }

  if (validEntries.length === 0 && seedAmount > 0) {
    return {
      pots: [
        {
          id: 'main',
          name: 'Main Pot',
          amount: seedAmount,
          eligiblePlayerIds: allNonFoldedPlayers,
          contributorIds: ['__pot_seed__'],
          tierCap: 0,
        },
      ],
      totalPot: seedAmount,
    };
  }

  // Get all unique positive contribution levels sorted ascending
  const levels = Array.from(new Set(validEntries.map(([, amt]) => amt))).sort((a, b) => a - b);

  interface RawTier {
    amount: number;
    eligiblePlayerIds: string[];
    contributorIds: string[];
    cap: number;
  }

  const rawTiers: RawTier[] = [];
  let prevCap = 0;

  for (const cap of levels) {
    const tierDelta = cap - prevCap;
    if (tierDelta <= 0) continue;

    let tierAmount = 0;
    const tierContributors: string[] = [];
    const tierEligible: string[] = [];

    for (const [pId, totalContrib] of validEntries) {
      const amtInTier = Math.max(0, Math.min(totalContrib, cap) - prevCap);
      if (amtInTier > 0) {
        tierAmount += amtInTier;
        tierContributors.push(pId);
        if (!foldedSet.has(pId)) {
          tierEligible.push(pId);
        }
      }
    }

    if (tierAmount > 0) {
      rawTiers.push({
        amount: tierAmount,
        eligiblePlayerIds: tierEligible,
        contributorIds: tierContributors,
        cap,
      });
    }

    prevCap = cap;
  }

  // Consolidate tiers into pots:
  // - Merge dead money (tier with 0 eligible players) into the preceding pot if available,
  //   or retain for active players if at the start.
  // - Merge adjacent tiers that share the exact same eligible players.
  const consolidated: Pot[] = [];

  for (const tier of rawTiers) {
    if (tier.amount <= 0) continue;

    // Case 1: All contributors in this tier folded (no eligible active players)
    if (tier.eligiblePlayerIds.length === 0) {
      if (consolidated.length > 0) {
        const prev = consolidated[consolidated.length - 1];
        prev.amount += tier.amount;
        prev.tierCap = Math.max(prev.tierCap, tier.cap);
        tier.contributorIds.forEach(id => {
          if (!prev.contributorIds.includes(id)) prev.contributorIds.push(id);
        });
        continue;
      }
    }

    // Case 2: Adjacent tier with the EXACT same set of eligible players
    if (consolidated.length > 0) {
      const prev = consolidated[consolidated.length - 1];
      const prevKey = [...prev.eligiblePlayerIds].sort().join(',');
      const currKey = [...tier.eligiblePlayerIds].sort().join(',');

      if (prevKey === currKey && prevKey.length > 0) {
        prev.amount += tier.amount;
        prev.tierCap = Math.max(prev.tierCap, tier.cap);
        tier.contributorIds.forEach(id => {
          if (!prev.contributorIds.includes(id)) prev.contributorIds.push(id);
        });
        continue;
      }
    }

    // Case 3: Start a new pot
    const potIdx = consolidated.length;
    consolidated.push({
      id: potIdx === 0 ? 'main' : `side-${potIdx}`,
      name: potIdx === 0 ? 'Main Pot' : `Side Pot ${potIdx}`,
      amount: tier.amount,
      eligiblePlayerIds: [...tier.eligiblePlayerIds],
      contributorIds: [...tier.contributorIds],
      tierCap: tier.cap,
    });
  }

  // Fallback: If all players folded, ensure we still return a Main Pot containing the total chips
  if (consolidated.length === 0) {
    consolidated.push({
      id: 'main',
      name: 'Main Pot',
      amount: totalPot,
      eligiblePlayerIds: [],
      contributorIds: validEntries.map(([id]) => id),
      tierCap: levels[levels.length - 1] || 0,
    });
  }

  // Add Admin-seeded initial pot (if any) to Main Pot
  if (seedAmount > 0 && consolidated.length > 0) {
    consolidated[0].amount += seedAmount;
    allNonFoldedPlayers.forEach(id => {
      if (!consolidated[0].eligiblePlayerIds.includes(id)) {
        consolidated[0].eligiblePlayerIds.push(id);
      }
    });
  }

  // Renumber pot names to be 100% sequential: Main Pot, Side Pot 1, Side Pot 2, ...
  consolidated.forEach((pot, idx) => {
    pot.id = idx === 0 ? 'main' : `side-${idx}`;
    pot.name = idx === 0 ? 'Main Pot' : `Side Pot ${idx}`;
  });

  return {
    pots: consolidated,
    totalPot,
  };
}

/**
 * Distributes winnings pot-by-pot.
 *
 * Each pot is evaluated independently.
 * Only players eligible for a pot may receive chips from that pot.
 * Split pots are handled with integer floor division, and odd remainder chips
 * are distributed 1-by-1 to the first tied winners.
 */
export function distributePots(
  pots: Pot[],
  potWinners: Record<string, string[]>, // potId -> array of winner playerIds
  playerMap?: Record<string, { name: string }>
): PayoutSummary {
  const payouts: PotPayout[] = [];
  const totalPlayerWins: Record<string, number> = {};

  for (const pot of pots) {
    if (pot.amount <= 0) continue;

    // Filter submitted winners to only those eligible for this pot
    const rawSelected = potWinners[pot.id] || [];
    let eligibleWinners = rawSelected.filter(id => pot.eligiblePlayerIds.includes(id));

    // Fallback: If no eligible winner was picked for this pot
    if (eligibleWinners.length === 0) {
      if (pot.eligiblePlayerIds.length === 1) {
        eligibleWinners = [pot.eligiblePlayerIds[0]];
      } else if (pot.eligiblePlayerIds.length > 1) {
        // Fallback to all eligible if none explicitly selected
        eligibleWinners = [...pot.eligiblePlayerIds];
      }
    }

    const n = eligibleWinners.length;
    const shares: Record<string, number> = {};

    if (n > 0) {
      const baseShare = Math.floor(pot.amount / n);
      const rem = pot.amount % n;

      eligibleWinners.forEach((wId, i) => {
        const share = baseShare + (i < rem ? 1 : 0);
        shares[wId] = share;
        totalPlayerWins[wId] = (totalPlayerWins[wId] || 0) + share;
      });
    }

    payouts.push({
      potId: pot.id,
      potName: pot.name,
      amount: pot.amount,
      winnerIds: eligibleWinners,
      shares,
    });
  }

  const pays: { name: string; amt: number }[] = [];
  if (playerMap) {
    for (const [pId, amt] of Object.entries(totalPlayerWins)) {
      if (amt > 0) {
        pays.push({ name: playerMap[pId]?.name || pId, amt });
      }
    }
  }

  return {
    payouts,
    totalPlayerWins,
    pays,
  };
}

