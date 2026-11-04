import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', textAlign: 'center', padding: 20 }}>
      <h1 style={{ fontSize: 36, color: '#38bdf8', marginBottom: 12 }}>404 · Table Not Found</h1>
      <p style={{ color: '#94a3b8', marginBottom: 24 }}>The game table or room you are looking for does not exist.</p>
      <Link href="/" className="sm pri" style={{ padding: '8px 20px', textDecoration: 'none' }}>
        ← Return to Card Room
      </Link>
    </div>
  );
}

