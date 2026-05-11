import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../api/client'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

interface TagEntry {
  name: string
  taggers: string[]
}

interface TaggedPhoto {
  photo_id: string
  filename: string
  tags: TagEntry[]
}

function thumbUrl(id: string) {
  return `${API_BASE}/api/photos/${id}/image?size=thumb`
}

function fullUrl(id: string) {
  return `${API_BASE}/api/photos/${id}/image`
}

export default function People() {
  const [filter, setFilter] = useState('')
  const [lightboxId, setLightboxId] = useState<string | null>(null)

  const { data: photos = [], isLoading } = useQuery<TaggedPhoto[]>({
    queryKey: ['admin-tags-summary'],
    queryFn: () => api.get('/admin/tags').then((r) => r.data),
  })

  const q = filter.trim().toLowerCase()
  const visible = q
    ? photos.filter((p) => p.tags.some((t) => t.name.toLowerCase().includes(q)))
    : photos

  const lightboxPhoto = lightboxId ? photos.find((p) => p.photo_id === lightboxId) : null

  // Collect all unique names for the filter typeahead feel
  const allNames = Array.from(new Set(photos.flatMap((p) => p.tags.map((t) => t.name)))).sort()

  return (
    <>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex justify-between items-start mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold">People</h1>
            <p className="text-gray-400 text-sm mt-1">
              {allNames.length} {allNames.length === 1 ? 'name' : 'names'} across {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
            </p>
          </div>
          <div className="flex items-center gap-4 mt-1">
            <Link to="/admin" className="text-blue-500 hover:underline text-sm whitespace-nowrap">← Admin</Link>
          </div>
        </div>

        {/* Name chips overview */}
        {allNames.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {allNames.map((name) => {
              const count = photos.filter((p) => p.tags.some((t) => t.name === name)).length
              const active = q === name.toLowerCase()
              return (
                <button
                  key={name}
                  onClick={() => setFilter(active ? '' : name)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border ${
                    active
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {name}
                  <span className={`ml-1.5 text-xs ${active ? 'text-blue-100' : 'text-gray-400'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* Filter input */}
        <div className="mb-6">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name…"
            className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 transition-colors"
          />
          {q && (
            <button
              onClick={() => setFilter('')}
              className="ml-2 text-sm text-gray-400 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : photos.length === 0 ? (
          <p className="text-gray-400 text-center py-20">No photos have been tagged yet.</p>
        ) : visible.length === 0 ? (
          <p className="text-gray-400 text-center py-20">No photos match "{filter}".</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {visible.map((photo) => {
              const matchingTags = q
                ? photo.tags.filter((t) => t.name.toLowerCase().includes(q))
                : photo.tags
              return (
                <div key={photo.photo_id} className="rounded-xl overflow-hidden bg-white shadow border border-gray-100">
                  <button
                    onClick={() => setLightboxId(photo.photo_id)}
                    className="block w-full focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <img
                      src={thumbUrl(photo.photo_id)}
                      alt={photo.filename}
                      className="w-full aspect-square object-cover hover:opacity-90 transition-opacity"
                      loading="lazy"
                    />
                  </button>
                  <div className="p-2 space-y-1">
                    {matchingTags.map((tag) => (
                      <div key={tag.name} className="text-xs">
                        <span className="font-semibold text-gray-800">{tag.name}</span>
                        <span className="text-gray-400 ml-1">({tag.taggers.join(', ')})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col"
          onClick={() => setLightboxId(null)}
        >
          <div
            className="flex items-center justify-between px-6 py-4 text-white flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap gap-2">
              {lightboxPhoto.tags.map((tag) => (
                <span key={tag.name} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-sm text-gray-200">
                  {tag.name}
                  <span className="text-gray-400 text-xs">({tag.taggers.join(', ')})</span>
                </span>
              ))}
            </div>
            <button
              onClick={() => setLightboxId(null)}
              className="ml-4 flex-shrink-0 text-gray-400 hover:text-white text-2xl leading-none transition-colors"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div
            className="flex-1 flex items-center justify-center px-8 min-h-0"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              key={lightboxPhoto.photo_id}
              src={fullUrl(lightboxPhoto.photo_id)}
              alt={lightboxPhoto.filename}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          <div
            className="px-6 py-4 text-center flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-gray-400 font-mono">{lightboxPhoto.filename || '(no filename)'}</p>
          </div>
        </div>
      )}
    </>
  )
}
