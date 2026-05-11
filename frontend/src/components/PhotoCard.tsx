import { useState } from 'react'

interface Props {
  url: string
}

export default function PhotoCard({ url }: Props) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative w-full max-w-3xl rounded-xl overflow-hidden shadow-2xl bg-gray-900">
      {!loaded && (
        <div className="flex items-center justify-center" style={{ minHeight: '20rem' }}>
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <img
        key={url}
        src={url}
        alt=""
        className={`w-full h-auto max-h-[75vh] object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}
