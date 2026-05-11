import { useState } from 'react'

interface Props {
  url: string
  exitVote: number | null
  onZoom?: () => void
}

export default function PhotoCard({ url, exitVote, onZoom }: Props) {
  const [loaded, setLoaded] = useState(false)

  const exitClass =
    exitVote === 1  ? 'photo-exit-yes'  :
    exitVote === -1 ? 'photo-exit-no'   :
    exitVote === 0  ? 'photo-exit-skip' : ''

  return (
    <div
      className={`group relative w-full max-w-3xl rounded-xl shadow-2xl bg-gray-900 border border-white/20 p-3 photo-enter ${exitClass}`}
      onClick={onZoom}
      style={onZoom ? { cursor: 'zoom-in' } : undefined}
    >
      {!loaded && (
        <div className="flex items-center justify-center" style={{ minHeight: '20rem' }}>
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <img
        key={url}
        src={url}
        alt=""
        className={`w-full h-auto max-h-[75vh] object-contain rounded-lg transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
        onLoad={() => setLoaded(true)}
      />
      {loaded && onZoom && (
        <button
          onClick={(e) => { e.stopPropagation(); onZoom() }}
          className="absolute top-5 right-5 w-9 h-9 items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-all hidden group-hover:flex backdrop-blur-sm"
          aria-label="View full size"
          title="View full size"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            <path d="M9 6.75a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 9 6.75Z" />
          </svg>
        </button>
      )}
    </div>
  )
}
