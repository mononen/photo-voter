import { useState } from 'react'

interface Props {
  url: string
}

export default function PhotoCard({ url }: Props) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative w-full max-w-2xl aspect-[4/3] bg-gray-900 rounded-xl overflow-hidden shadow-2xl">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <img
        key={url}
        src={url}
        alt=""
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}
