import PokerGame from '@/components/poker/PokerGame';

export const metadata = {
  title: "Texas Hold'em Poker · Sattebaazi",
  description: "IRL Texas Hold'em poker tracker with board cards, main & side pots, and all-in calculations.",
};

export default function PokerPage() {
  return <PokerGame />;
}

