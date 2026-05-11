import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../api/client'

interface LeaderboardEntry {
  name: string
  vote_count: number
}

export default function Leaderboard() {
  const { data: entries, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard'],
    queryFn: () => api.get('/leaderboard').then((r) => r.data),
  })

  const max = entries?.[0]?.vote_count ?? 1

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'radial-gradient(ellipse at 50% 42%, #1a1c2e 0%, #07070a 68%)' }}
    >
      <div className="max-w-lg mx-auto px-6 py-10">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors">← Back</Link>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !entries?.length ? (
          <p className="text-gray-500 text-center py-20">No votes yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map((entry, i) => {
              const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
              const barPct = max > 0 ? (entry.vote_count / max) * 100 : 0
              return (
                <div
                  key={entry.name}
                  className="relative border border-white/10 bg-white/5 rounded-xl p-4 overflow-hidden"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-white/5 rounded-xl"
                    style={{ width: `${barPct}%`, transition: 'width 0.6s ease' }}
                  />
                  <div className="relative flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-gray-500 tabular-nums text-sm w-5 text-right flex-shrink-0">
                        {medal ?? `${i + 1}`}
                      </span>
                      <span className="font-medium text-white truncate">{entry.name || 'Anonymous'}</span>
                    </div>
                    <span className="tabular-nums text-gray-300 flex-shrink-0">
                      {entry.vote_count} <span className="text-gray-600 text-xs">votes</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
