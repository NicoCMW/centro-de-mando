import Link from 'next/link'

export default function Home() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Centro de Mando</h1>
      <p className="text-sm text-muted-foreground mt-2">
        Mission Control (v1) — tasks + agentes.
      </p>
      <div className="mt-6 flex gap-4">
        <Link className="underline" href="/board">
          Ir al tablero →
        </Link>
        <Link className="underline" href="/login">
          Login →
        </Link>
      </div>
    </main>
  )
}
