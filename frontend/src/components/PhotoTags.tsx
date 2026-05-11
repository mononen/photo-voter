import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'

interface Tag {
  id: string
  name: string
  created_at: string
}

interface Props {
  photoId: string
  disabled: boolean
}

export default function PhotoTags({ photoId, disabled }: Props) {
  const queryClient = useQueryClient()
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ['tags', photoId],
    queryFn: () => api.get(`/photos/${photoId}/tags`).then((r) => r.data),
    enabled: !!photoId,
  })

  const { data: suggestions = [] } = useQuery<string[]>({
    queryKey: ['autocomplete', input],
    queryFn: () => api.get('/tags/autocomplete', { params: { q: input } }).then((r) => r.data),
    enabled: showSuggestions,
    staleTime: 30_000,
  })

  const filteredSuggestions = suggestions.filter(
    (s) => !tags.some((t) => t.name.toLowerCase() === s.toLowerCase())
  )

  const addTag = useMutation({
    mutationFn: (name: string) => api.post(`/photos/${photoId}/tags`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', photoId] })
      queryClient.invalidateQueries({ queryKey: ['autocomplete'] })
      setInput('')
      setShowSuggestions(false)
    },
  })

  const removeTag = useMutation({
    mutationFn: (tagId: string) => api.delete(`/tags/${tagId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', photoId] })
    },
  })

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSubmit(name: string) {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 100) return
    if (tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) return
    addTag.mutate(trimmed)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit(input)
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      inputRef.current?.blur()
    }
  }

  if (tags.length === 0 && disabled) return null

  return (
    <div className="w-full max-w-xl space-y-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-sm text-gray-200"
            >
              {tag.name}
              {!disabled && (
                <button
                  onClick={() => removeTag.mutate(tag.id)}
                  className="ml-1 text-gray-400 hover:text-white transition-colors leading-none"
                  aria-label={`Remove ${tag.name}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!disabled && (
        <div ref={containerRef} className="relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setShowSuggestions(true) }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder="Who's in this photo? (press Enter)"
            maxLength={100}
            className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/40 transition-colors"
          />
          {showSuggestions && filteredSuggestions.length > 0 && (
            <ul className="absolute z-20 top-full mt-1 w-full bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
              {filteredSuggestions.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); handleSubmit(name) }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10 transition-colors"
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
