const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

interface FilmstripPhoto {
  id: string
  filename: string
}

interface FilmstripProps {
  photos: FilmstripPhoto[]
  activeIndex: number
  votes: Record<string, number>
  onSelect: (index: number) => void
  disabled: boolean
}

const VOTE_STYLE: Record<number, { overlay: string; icon: string }> = {
  1:  { overlay: 'bg-green-500/50', icon: '✓' },
  0:  { overlay: 'bg-gray-500/50',  icon: '–' },
  [-1]: { overlay: 'bg-red-500/50', icon: '✗' },
}

export default function Filmstrip({ photos, activeIndex, votes, onSelect, disabled }: FilmstripProps) {
  return (
    <div className="flex overflow-x-auto gap-2 px-2 py-1 max-w-full">
      {photos.map((photo, i) => {
        const isActive = i === activeIndex
        const vote = photo.id in votes ? votes[photo.id] : undefined
        const voted = vote !== undefined
        const vs = voted ? VOTE_STYLE[vote as keyof typeof VOTE_STYLE] : undefined

        return (
          <button
            key={photo.id}
            onClick={() => !disabled && onSelect(i)}
            disabled={disabled}
            className={[
              'relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden',
              'transition-all duration-150',
              isActive ? 'ring-2 ring-white scale-105' : 'opacity-60 hover:opacity-90',
              disabled ? 'cursor-default' : 'cursor-pointer',
            ].join(' ')}
            title={photo.filename}
          >
            <img
              src={`${API_BASE}/api/photos/${photo.id}/image?size=thumb`}
              alt={photo.filename}
              className="w-full h-full object-cover"
              draggable={false}
            />
            {vs && (
              <div className={`absolute inset-0 flex items-center justify-center ${vs.overlay}`}>
                <span className="text-white text-lg font-bold drop-shadow">{vs.icon}</span>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
