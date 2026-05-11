import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import api from '../api/client'
import { ReactNode } from 'react'

export default function RankingsRoute({ children }: { children: ReactNode }) {
  const { token, isAdmin } = useAuth()

  if (!token) return <Navigate to="/login" replace />
  if (isAdmin) return <>{children}</>

  // Regular users: only allowed in once they've voted on every photo
  const { data, isPending } = useQuery({
    queryKey: ['votingComplete'],
    queryFn: () => api.get('/photos/next', { validateStatus: (s) => s < 500 }),
    staleTime: 30_000,
  })

  if (isPending) return null

  // 204 = no unvoted photos left → done
  if (data?.status === 204) return <>{children}</>

  return <Navigate to="/" replace />
}
