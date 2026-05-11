import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../api/client'

interface RankedPhoto {
  id: string
  url: string
  filename: string
  score: number
  vote_count: number
}

export default function Rankings() {
  const { data: photos, isLoading } = useQuery<RankedPhoto[]>({
    queryKey: ['rankings'],
    queryFn: () => api.get('/photos/rankings').then((r) => r.data),
  })

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Rankings</h1>
        <Link to="/" className="text-blue-500 hover:underline text-sm">
          ← Back to voting
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !photos?.length ? (
        <p className="text-gray-500 text-center py-20">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {photos.map((photo, i) => (
            <div key={photo.id} className="relative rounded-xl overflow-hidden bg-gray-100 shadow">
              <img
                src={photo.url}
                alt={photo.filename}
                className="w-full aspect-square object-cover"
                loading="lazy"
              />
              <div className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-full">
                #{i + 1}
              </div>
              <div className="p-2 flex justify-between text-sm">
                <span
                  className={
                    photo.score > 0
                      ? 'text-green-600 font-semibold'
                      : photo.score < 0
                      ? 'text-red-600 font-semibold'
                      : 'text-gray-500'
                  }
                >
                  {photo.score > 0 ? '+' : ''}
                  {photo.score}
                </span>
                <span className="text-gray-400">{photo.vote_count}v</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
