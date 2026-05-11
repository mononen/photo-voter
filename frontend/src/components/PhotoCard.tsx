import { useState } from 'react'

interface Props {
  url: string
  exitVote: number | null
}

export default function PhotoCard({ url, exitVote }: Props) {
  const [loaded, setLoaded] = useState(false)

  const exitClass =
    exitVote === 1  ? 'photo-exit-yes'  :
    exitVote === -1 ? 'photo-exit-no'   :
    exitVote === 0  ? 'photo-exit-skip' : ''

  return (
    <div className={`relative w-full max-w-3xl rounded-xl shadow-2xl bg-gray-900 border border-white/20 p-3 photo-enter ${exitClass}`}>
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
    </div>
  )
}
