import { useState } from 'react'

interface Props {
  onVote: (vote: number) => void
  disabled: boolean
}

const CRITERIA = [
  { icon: '✗', color: 'text-red-500', label: 'Bad', sub: 'awful', desc: 'nothing in focus, nobody in frame' },
  { icon: '—', color: 'text-gray-400', label: 'Mid', sub: 'decent', desc: "someone's in focus and in frame, but nothing special" },
  { icon: '✓', color: 'text-green-500', label: 'Good', sub: 'banger', desc: 'in focus, in frame, doing something' },
]

export default function VoteButtons({ onVote, disabled }: Props) {
  const [showInfo, setShowInfo] = useState(false)

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-8 items-center">
        <button
          onClick={() => onVote(-1)}
          disabled={disabled}
          title="Bad"
          className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 disabled:opacity-40 text-white text-2xl font-bold transition-all shadow-lg"
        >
          ✗
        </button>
        <button
          onClick={() => onVote(0)}
          disabled={disabled}
          title="Mid"
          className="w-14 h-14 rounded-full bg-gray-400 hover:bg-gray-500 active:scale-95 disabled:opacity-40 text-white text-2xl font-bold transition-all shadow-lg"
        >
          —
        </button>
        <button
          onClick={() => onVote(1)}
          disabled={disabled}
          title="Good"
          className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 active:scale-95 disabled:opacity-40 text-white text-2xl font-bold transition-all shadow-lg"
        >
          ✓
        </button>
        <button
          onClick={() => setShowInfo(v => !v)}
          className="w-7 h-7 rounded-full border border-gray-400 text-gray-400 hover:text-gray-200 hover:border-gray-200 text-sm font-bold transition-colors flex items-center justify-center leading-none"
          aria-label="Voting criteria"
        >
          i
        </button>
      </div>

      {showInfo && (
        <div className="mt-1 bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-sm text-left w-72 shadow-xl">
          {CRITERIA.map(({ icon, color, label, sub, desc }) => (
            <div key={label} className="flex items-start gap-3 py-1.5 first:pt-0 last:pb-0 border-b border-gray-700 last:border-0">
              <span className={`${color} font-bold text-base w-4 text-center shrink-0 mt-0.5`}>{icon}</span>
              <span className="text-gray-200">
                <span className="font-semibold">{label}</span>
                <span className="text-gray-400"> — {sub}: </span>
                {desc}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
