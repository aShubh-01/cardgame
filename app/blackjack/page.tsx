import BlackjackGame from '@/components/blackjack/BlackjackGame';

export const metadata = {
  title: 'Blackjack · Sattebaazi',
  description: 'Offline Casino Blackjack 21 tracker with Dealer/House banking, splits, doubles, and insurance.',
};

export default function BlackjackPage() {
  return <BlackjackGame />;
}

