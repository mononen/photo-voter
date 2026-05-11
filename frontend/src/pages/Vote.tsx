import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import api from '../api/client'
import PhotoCard from '../components/PhotoCard'
import VoteButtons from '../components/VoteButtons'
import { useAuth } from '../hooks/useAuth'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

interface Photo {
  id: string
}

async function fetchNextPhoto(): Promise<Photo | null> {
  const res = await api.get('/photos/next', { validateStatus: (s) => s < 500 })
  if (res.status === 204) return null
  return res.data as Photo
}

export default function Vote() {
  const queryClient = useQueryClient()
  const { logout, isAdmin } = useAuth()
  const [voting, setVoting] = useState(false)

  const { data: photo, isLoading } = useQuery<Photo | null>({
    queryKey: ['nextPhoto'],
    queryFn: fetchNextPhoto,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const vote = useMutation({
    mutationFn: (v: number) => api.post('/votes', { photo_id: photo?.id, vote: v }),
    onMutate: () => setVoting(true),
    onSettled: () => {
      setVoting(false)
      queryClient.invalidateQueries({ queryKey: ['nextPhoto'] })
    },
  })

  return (
    <div className="flex flex-col min-h-screen bg-black text-white">
      <header className="flex justify-between items-center px-6 py-4">
        <div className="flex gap-4">
          {isAdmin && (
            <Link to="/rankings" className="text-sm text-gray-400 hover:text-white transition-colors">
              Rankings
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className="text-sm text-gray-400 hover:text-white transition-colors">
              Admin
            </Link>
          )}
        </div>
        <button onClick={logout} className="text-sm text-gray-400 hover:text-white transition-colors">
          Log out
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
        {isLoading ? (
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : photo === null ? (
          <div className="text-center space-y-4">
            <p className="text-2xl font-bold">All done!</p>
            <p className="text-gray-400">You've voted on every photo.</p>
            {isAdmin && (
              <Link to="/rankings" className="text-blue-400 hover:underline">
                See the rankings →
              </Link>
            )}
          </div>
        ) : (
          <>
            <PhotoCard url={`${API_BASE}/api/photos/${photo.id}/image`} />
            <VoteButtons onVote={(v) => vote.mutate(v)} disabled={voting} />
          </>
        )}
      </main>
    </div>
  )
}
