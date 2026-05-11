import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useState, useRef, useEffect, useCallback } from 'react'
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

function photoUrl(id: string) {
  return `${API_BASE}/api/photos/${id}/image`
}

interface LbTransform { scale: number; x: number; y: number }
const LB_RESET: LbTransform = { scale: 1, x: 0, y: 0 }

export default function Vote() {
  const queryClient = useQueryClient()
  const { logout, isAdmin } = useAuth()
  const [exitVote, setExitVote] = useState<number | null>(null)
  const [exitPhotoId, setExitPhotoId] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lbTransform, setLbTransform] = useState<LbTransform>(LB_RESET)
  const [hiResUrl, setHiResUrl] = useState<string | null>(null)
  const [hiResLoaded, setHiResLoaded] = useState(false)

  const lbRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const hasDraggedRef = useRef(false)

  const prefetchRef = useRef<{ animationDone: boolean; photo?: Photo | null }>({
    animationDone: true,
  })

  const { data: photo, isLoading } = useQuery<Photo | null>({
    queryKey: ['nextPhoto'],
    queryFn: fetchNextPhoto,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })

  const vote = useMutation({
    mutationFn: ({ v, photoId }: { v: number; photoId: string }) =>
      api.post('/votes', { photo_id: photoId, vote: v }),
  })

  // Derived display values — declared early so effects can reference them
  const renderedId = exitVote !== null ? exitPhotoId : (photo?.id ?? null)
  const renderedUrl = renderedId ? photoUrl(renderedId) : null

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false)
    setLbTransform(LB_RESET)
    setHiResUrl(null)
    setHiResLoaded(false)
  }, [])

  // When lightbox opens, lazily load a version sized to the device's actual pixel dimensions
  useEffect(() => {
    if (!lightboxOpen || !renderedId) return
    setHiResUrl(null)
    setHiResLoaded(false)

    // Use at least 2× multiplier so non-retina desktops (DPR=1) still get a
    // higher-resolution image that looks sharp when zoomed in.
    const dpr = Math.max(window.devicePixelRatio, 2)
    const w = Math.min(Math.round(window.innerWidth * dpr), 4096)
    const h = Math.min(Math.round(window.innerHeight * dpr), 4096)
    const url = `${API_BASE}/api/photos/${renderedId}/image?w=${w}&h=${h}`

    // Only fetch hi-res if it would actually be larger than the base (1920×1080).
    if (w > 1920 || h > 1080) setHiResUrl(url)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen, renderedId])

  // Keyboard close
  useEffect(() => {
    if (!lightboxOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeLightbox() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxOpen, closeLightbox])

  // Wheel zoom — must be non-passive to preventDefault
  useEffect(() => {
    const el = lbRef.current
    if (!lightboxOpen || !el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setLbTransform((prev) => {
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
        const newScale = Math.min(Math.max(prev.scale * factor, 1), 8)
        if (newScale <= 1) return LB_RESET

        const rect = el.getBoundingClientRect()
        const cx = e.clientX - rect.left - rect.width / 2
        const cy = e.clientY - rect.top - rect.height / 2
        const ratio = newScale / prev.scale
        return {
          scale: newScale,
          x: cx * (1 - ratio) + prev.x * ratio,
          y: cy * (1 - ratio) + prev.y * ratio,
        }
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [lightboxOpen])

  function onLbMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    hasDraggedRef.current = false
    dragRef.current = { x: e.clientX, y: e.clientY, ox: lbTransform.x, oy: lbTransform.y }
  }

  function onLbMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedRef.current = true
    setLbTransform((prev) => ({ ...prev, x: dragRef.current!.ox + dx, y: dragRef.current!.oy + dy }))
  }

  function onLbMouseUp() {
    dragRef.current = null
  }

  function onBackdropClick() {
    if (!hasDraggedRef.current) closeLightbox()
  }

  function handleVote(v: number) {
    if (exitVote !== null) return
    const currentId = photo?.id ?? ''

    prefetchRef.current = { animationDone: false }
    setExitVote(v)
    setExitPhotoId(currentId)

    vote.mutateAsync({ v, photoId: currentId })
      .then(() => fetchNextPhoto())
      .then((next) => {
        if (next) new Image().src = photoUrl(next.id)
        if (prefetchRef.current.animationDone) {
          queryClient.setQueryData(['nextPhoto'], next ?? null)
        } else {
          prefetchRef.current.photo = next ?? null
        }
      })
      .catch(() => {
        if (prefetchRef.current.animationDone) {
          queryClient.invalidateQueries({ queryKey: ['nextPhoto'] })
        }
      })

    setTimeout(() => {
      const prev = prefetchRef.current
      prefetchRef.current = { animationDone: true }
      setExitVote(null)
      setExitPhotoId(null)

      if ('photo' in prev) {
        queryClient.setQueryData(['nextPhoto'], prev.photo)
      } else {
        queryClient.invalidateQueries({ queryKey: ['nextPhoto'] })
      }
    }, 300)
  }

  const isZoomed = lbTransform.scale > 1

  return (
    <div
      className="flex flex-col min-h-screen text-white"
      style={{ background: 'radial-gradient(ellipse at 50% 42%, #1a1c2e 0%, #07070a 68%)' }}
    >
      <header className="flex justify-between items-center px-6 py-4">
        <div className="flex gap-4">
          <Link to="/leaderboard" className="text-sm text-gray-400 hover:text-white transition-colors">
            Leaderboard
          </Link>
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
        ) : !photo && exitVote === null ? (
          <div className="text-center space-y-4">
            <p className="text-2xl font-bold">All done!</p>
            <p className="text-gray-400">You've voted on every photo.</p>
            {isAdmin && (
              <Link to="/rankings" className="text-blue-400 hover:underline">
                See the rankings →
              </Link>
            )}
          </div>
        ) : renderedUrl ? (
          <>
            <PhotoCard
              key={renderedId ?? undefined}
              url={renderedUrl}
              exitVote={exitVote}
              onZoom={() => setLightboxOpen(true)}
            />
            <VoteButtons onVote={handleVote} disabled={exitVote !== null} />
          </>
        ) : null}
      </main>

      {lightboxOpen && renderedUrl && (
        <div
          ref={lbRef}
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center overflow-hidden"
          style={{ cursor: isZoomed ? (dragRef.current ? 'grabbing' : 'grab') : 'zoom-in' }}
          onClick={onBackdropClick}
          onMouseDown={onLbMouseDown}
          onMouseMove={onLbMouseMove}
          onMouseUp={onLbMouseUp}
          onMouseLeave={onLbMouseUp}
        >
          <button
            onClick={(e) => { e.stopPropagation(); closeLightbox() }}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-xl transition-colors"
            aria-label="Close"
            style={{ cursor: 'default' }}
          >
            ×
          </button>
          {isZoomed && (
            <button
              onClick={(e) => { e.stopPropagation(); setLbTransform(LB_RESET) }}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute top-4 right-16 z-10 px-3 h-10 flex items-center rounded-full bg-white/10 hover:bg-white/20 text-white text-xs transition-colors"
              style={{ cursor: 'default' }}
            >
              Reset zoom
            </button>
          )}
          <div
            className="relative max-w-full max-h-full flex items-center justify-center"
            style={{
              transform: `translate(${lbTransform.x}px, ${lbTransform.y}px) scale(${lbTransform.scale})`,
              transformOrigin: 'center center',
              transition: dragRef.current ? 'none' : 'transform 0.05s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Base image — shown immediately (already cached from vote page) */}
            <img
              src={renderedUrl}
              alt=""
              draggable={false}
              className="max-w-full max-h-full object-contain select-none block"
            />
            {/* Hi-res image — fades in once loaded */}
            {hiResUrl && (
              <img
                key={hiResUrl}
                src={hiResUrl}
                alt=""
                draggable={false}
                className="absolute inset-0 w-full h-full object-contain select-none transition-opacity duration-500"
                style={{ opacity: hiResLoaded ? 1 : 0 }}
                onLoad={() => setHiResLoaded(true)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
