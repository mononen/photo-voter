import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen px-4"
      style={{ background: 'radial-gradient(ellipse at 50% 42%, #1a1c2e 0%, #07070a 68%)' }}
    >
      {/* Branding */}
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-9 h-9 text-white/80">
            <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z" clipRule="evenodd" />
          </svg>
          <h1 className="text-3xl font-bold tracking-tight text-white">Photo Voter</h1>
        </div>
        <p className="text-gray-400 text-sm">Rate the shots, find the best ones.</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
        <h2 className="text-xl font-semibold text-white mb-6">Sign in</h2>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-white/30 transition"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder:text-gray-500 outline-none focus:ring-2 focus:ring-white/30 transition"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-500 text-white rounded-lg py-2 hover:bg-blue-600 disabled:opacity-60 transition-colors font-medium"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="flex items-center justify-center gap-1.5 mt-5">
          <p className="text-sm text-gray-400">
            No account?{' '}
            <Link to="/register" className="text-blue-400 hover:underline">
              Register
            </Link>
          </p>
          <button
            onClick={() => setWhyOpen(true)}
            className="w-5 h-5 rounded-full border border-gray-600 text-gray-500 hover:text-gray-300 hover:border-gray-400 text-xs font-bold transition-colors flex items-center justify-center"
            aria-label="Why do I need to register?"
          >
            ?
          </button>
        </div>

        <p className="text-xs text-gray-600 mt-5 text-center leading-relaxed">
          Security disclaimer: I did not put a lot of effort into securing this app. Please don't use a password you actually care about.
        </p>
      </div>

      {/* Why register modal */}
      {whyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
          onClick={() => setWhyOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-semibold text-white">Why do I need to register?</h3>
              <button
                onClick={() => setWhyOpen(false)}
                className="text-gray-500 hover:text-white transition-colors text-xl leading-none ml-4"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">
              Registration lets us track each person's votes separately and prevent the same person from voting multiple times. Without it, the results wouldn't mean much.
            </p>
            <p className="text-sm text-gray-400 mt-3 leading-relaxed">
              We only store your email and password — nothing else. No spam, no account verification, no strings attached.
            </p>
            <button
              onClick={() => setWhyOpen(false)}
              className="mt-5 w-full bg-white/10 hover:bg-white/15 text-white text-sm rounded-lg py-2 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
