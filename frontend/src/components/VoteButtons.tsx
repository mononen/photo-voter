interface Props {
  onVote: (vote: number) => void
  disabled: boolean
}

export default function VoteButtons({ onVote, disabled }: Props) {
  return (
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
    </div>
  )
}
