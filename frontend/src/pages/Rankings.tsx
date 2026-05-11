import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../hooks/useAuth'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

interface RankedPhoto {
  id: string
  filename: string
  score: number
  vote_count: number
}

interface AdminTag {
  id: string
  name: string
  submitted_by: string
  created_at: string
}

function imageUrl(id: string, thumb = false) {
  return `${API_BASE}/api/photos/${id}/image${thumb ? '?size=thumb' : ''}`
}

export default function Rankings() {
  const { isAdmin } = useAuth()
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [showZeroVotes, setShowZeroVotes] = useState(true)

  const { data: photos, isLoading } = useQuery<RankedPhoto[]>({
    queryKey: ['rankings'],
    queryFn: () => api.get('/photos/rankings').then((r) => r.data),
  })

  const visiblePhotos = photos
    ? (showZeroVotes ? photos : photos.filter((p) => p.vote_count > 0)).map((p) => ({
        ...p,
        rank: photos.indexOf(p) + 1,
      }))
    : []

  const closeLightbox = useCallback(() => setLightboxIdx(null), [])

  const prev = useCallback(() =>
    setLightboxIdx((i) => (i !== null && i > 0 ? i - 1 : i)), [])

  const next = useCallback(() =>
    setLightboxIdx((i) => (i !== null && i < visiblePhotos.length - 1 ? i + 1 : i)), [visiblePhotos.length])

  useEffect(() => {
    if (lightboxIdx === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIdx, closeLightbox, prev, next])

  const active = lightboxIdx !== null ? visiblePhotos[lightboxIdx] : null

  const { data: adminTags = [] } = useQuery<AdminTag[]>({
    queryKey: ['admin-tags', active?.id],
    queryFn: () => api.get(`/admin/photos/${active!.id}/tags`).then((r) => r.data),
    enabled: isAdmin && !!active,
  })

  // Group tags by name: { "John Doe": ["Alice", "Bob"], ... }
  const groupedTags = adminTags.reduce<Record<string, string[]>>((acc, t) => {
    if (!acc[t.name]) acc[t.name] = []
    acc[t.name].push(t.submitted_by)
    return acc
  }, {})

  const zeroVoteCount = photos ? photos.filter((p) => p.vote_count === 0).length : 0

  return (
    <>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Rankings</h1>
          <div className="flex items-center gap-4">
            {zeroVoteCount > 0 && (
              <button
                onClick={() => { setLightboxIdx(null); setShowZeroVotes((v) => !v) }}
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                {showZeroVotes ? `Hide unvoted (${zeroVoteCount})` : `Show unvoted (${zeroVoteCount})`}
              </button>
            )}
            <Link to="/" className="text-blue-500 hover:underline text-sm">← Back to voting</Link>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !photos?.length ? (
          <p className="text-gray-500 text-center py-20">No photos yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {visiblePhotos.map((photo, i) => (
              <button
                key={photo.id}
                onClick={() => setLightboxIdx(i)}
                className="relative rounded-xl overflow-hidden bg-gray-100 shadow text-left hover:ring-2 hover:ring-blue-400 transition-all focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <img
                  src={imageUrl(photo.id, true)}
                  alt={photo.filename}
                  className="w-full aspect-square object-cover"
                  loading="lazy"
                />
                <div className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-full">
                  #{photo.rank}
                </div>
                <div className="p-2 space-y-1">
                  <p className="text-xs text-gray-500 truncate" title={photo.filename}>
                    {photo.filename || '—'}
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className={
                      photo.score > 0 ? 'text-green-600 font-semibold'
                      : photo.score < 0 ? 'text-red-600 font-semibold'
                      : 'text-gray-500'
                    }>
                      {photo.score > 0 ? '+' : ''}{photo.score}
                    </span>
                    <span className="text-gray-400">{photo.vote_count}v</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {active && photos && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
          onClick={closeLightbox}
        >
          {/* Top bar */}
          <div
            className="flex items-center justify-between px-6 py-4 text-white flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-300">
                #{active.rank} / {photos.length}
              </span>
              <span className={`text-sm font-semibold ${
                active.score > 0 ? 'text-green-400'
                : active.score < 0 ? 'text-red-400'
                : 'text-gray-400'
              }`}>
                {active.score > 0 ? '+' : ''}{active.score}
              </span>
              <span className="text-sm text-gray-500">{active.vote_count} votes</span>
            </div>
            <button
              onClick={closeLightbox}
              className="text-gray-400 hover:text-white text-2xl leading-none transition-colors"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Image */}
          <div
            className="flex-1 flex items-center justify-center px-16 min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              key={active.id}
              src={imageUrl(active.id)}
              alt={active.filename}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* Bottom bar — filename + admin tags */}
          <div
            className="px-6 py-4 text-center flex-shrink-0 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-gray-400 font-mono">{active.filename || '(no filename)'}</p>
            {isAdmin && Object.keys(groupedTags).length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {Object.entries(groupedTags).map(([name, taggers]) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm text-gray-200"
                    title={`Tagged by: ${taggers.join(', ')}`}
                  >
                    {name}
                    <span className="text-gray-500 text-xs">({taggers.join(', ')})</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Prev / Next */}
          {lightboxIdx! > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); prev() }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-xl transition-colors"
              aria-label="Previous"
            >
              ‹
            </button>
          )}
          {lightboxIdx! < visiblePhotos.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); next() }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-xl transition-colors"
              aria-label="Next"
            >
              ›
            </button>
          )}
        </div>
      )}
    </>
  )
}
