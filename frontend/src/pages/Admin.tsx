import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../api/client'

interface Settings {
  oauth_connected: boolean
  authorized_email: string
  photo_count: number
}

interface UserVoteStat {
  name: string
  email: string
  vote_count: number
}

interface Stats {
  total_users: number
  total_votes: number
  photos_voted_on: number
  upvotes: number
  downvotes: number
  skips: number
  completion_pct: number
  avg_votes_per_photo: number
  votes_per_user: UserVoteStat[]
}

interface PickerSession {
  session_id: string
  picker_url: string
  media_items_set: boolean
  expire_time: string
}

type ResetScope = 'votes' | 'votes_and_tags' | 'event' | 'full'

interface ResetOption {
  scope: ResetScope
  label: string
  description: string
  deletes: string[]
  keeps: string[]
}

const RESET_OPTIONS: ResetOption[] = [
  {
    scope: 'votes',
    label: 'Reset votes',
    description: 'Wipe all votes so everyone can vote again on the same photos.',
    deletes: ['All votes'],
    keeps: ['Photos', 'People tags', 'User accounts'],
  },
  {
    scope: 'votes_and_tags',
    label: 'Reset votes + people tags',
    description: 'Wipe votes and all photo tagging. Photos stay, re-tagging starts fresh.',
    deletes: ['All votes', 'All people tags'],
    keeps: ['Photos', 'User accounts'],
  },
  {
    scope: 'event',
    label: 'New event (keep accounts)',
    description: 'Remove all photos. Votes and tags cascade. User accounts remain.',
    deletes: ['All photos', 'All votes', 'All people tags'],
    keeps: ['User accounts'],
  },
  {
    scope: 'full',
    label: 'Full wipe',
    description: 'Remove everything. Only your admin account survives.',
    deletes: ['All photos', 'All votes', 'All people tags', 'All non-admin user accounts'],
    keeps: ['Admin account only'],
  },
]

function ResetModal({
  option,
  onClose,
  onConfirm,
  isPending,
}: {
  option: ResetOption
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}) {
  const [typed, setTyped] = useState('')
  const confirmed = typed === 'RESET'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-md bg-[#13141f] border border-white/10 rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-1">{option.label}</h2>
        <p className="text-sm text-gray-400 mb-5">{option.description}</p>

        <div className="mb-5 space-y-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Will be deleted</p>
            <ul className="space-y-1">
              {option.deletes.map((d) => (
                <li key={d} className="flex items-center gap-2 text-sm text-red-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1.5">Will be kept</p>
            <ul className="space-y-1">
              {option.keeps.map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm text-gray-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  {k}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-sm text-gray-400 mb-2">
          Type <span className="font-mono font-bold text-white">RESET</span> to confirm:
        </p>
        <input
          autoFocus
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="RESET"
          className="w-full px-3 py-2 text-sm bg-white/5 border border-white/15 rounded-lg text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 mb-4"
        />

        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={!confirmed || isPending}
            className="flex-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? 'Resetting…' : 'Confirm reset'}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Admin() {
  const [searchParams] = useSearchParams()
  const oauthResult = searchParams.get('connected') ? 'connected' : searchParams.get('error') ?? null
  const queryClient = useQueryClient()

  const [session, setSession] = useState<PickerSession | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [refreshResult, setRefreshResult] = useState<string | null>(null)
  const [activeReset, setActiveReset] = useState<ResetScope | null>(null)
  const [resetResult, setResetResult] = useState<string | null>(null)

  const { data: settings, isLoading, refetch: refetchSettings } = useQuery<Settings>({
    queryKey: ['adminSettings'],
    queryFn: () => api.get('/admin/settings').then((r) => r.data),
  })

  const { data: stats, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ['adminStats'],
    queryFn: () => api.get('/admin/stats').then((r) => r.data),
  })

  const clearPhotos = useMutation({
    mutationFn: () => api.delete('/admin/photos'),
    onSuccess: () => { setConfirmClear(false); refetchSettings() },
  })

  const refreshPhotos = useMutation({
    mutationFn: () => api.post('/admin/photos/refresh'),
    onSuccess: (res) => {
      setRefreshResult(`Refreshed ${res.data.refreshed} photo${res.data.refreshed === 1 ? '' : 's'}`)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setRefreshResult(`Error: ${msg ?? 'refresh failed'}`)
    },
  })

  const { data: sessionStatus } = useQuery<PickerSession>({
    queryKey: ['pickerSession', session?.session_id],
    queryFn: () =>
      api.get(`/admin/picker/session/${session!.session_id}`).then((r) => r.data),
    enabled: !!session && !session.media_items_set,
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
  })

  useEffect(() => {
    if (sessionStatus?.media_items_set) setSession(sessionStatus)
  }, [sessionStatus])

  const ready = sessionStatus?.media_items_set ?? session?.media_items_set ?? false

  const startSession = useMutation({
    mutationFn: () => api.post('/admin/picker/session').then((r) => r.data as PickerSession),
    onSuccess: (data) => {
      setSession(data)
      setImportResult(null)
      window.open(data.picker_url, '_blank', 'noopener')
    },
  })

  const importSession = useMutation({
    mutationFn: () => api.post(`/admin/picker/session/${session!.session_id}/import`),
    onSuccess: (res) => {
      setImportResult(`Imported ${res.data.imported} photo${res.data.imported === 1 ? '' : 's'}`)
      setSession(null)
      refetchSettings()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setImportResult(`Error: ${msg ?? 'import failed'}`)
    },
  })

  const resetMutation = useMutation({
    mutationFn: (scope: ResetScope) => api.post('/admin/reset', { scope }),
    onSuccess: (_res, scope) => {
      setActiveReset(null)
      const label = RESET_OPTIONS.find((o) => o.scope === scope)?.label ?? scope
      setResetResult(`${label} completed.`)
      refetchSettings()
      refetchStats()
      queryClient.invalidateQueries({ queryKey: ['admin-tags-summary'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setResetResult(`Error: ${msg ?? 'reset failed'}`)
      setActiveReset(null)
    },
  })

  const connectGoogle = async () => {
    const res = await api.get('/admin/auth/google/url')
    window.location.href = res.data.url
  }

  const activeResetOption = RESET_OPTIONS.find((o) => o.scope === activeReset) ?? null

  return (
    <div
      className="min-h-screen text-white"
      style={{ background: 'radial-gradient(ellipse at 50% 42%, #1a1c2e 0%, #07070a 68%)' }}
    >
      <div className="max-w-xl mx-auto px-6 py-10">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Admin Settings</h1>
          <Link to="/" className="text-sm text-gray-400 hover:text-white transition-colors">← Back</Link>
        </div>

        {oauthResult === 'connected' && (
          <div className="mb-6 p-3 bg-green-500/15 border border-green-500/30 text-green-400 rounded-lg text-sm">
            Google Photos connected successfully.
          </div>
        )}
        {oauthResult && oauthResult !== 'connected' && (
          <div className="mb-6 p-3 bg-red-500/15 border border-red-500/30 text-red-400 rounded-lg text-sm">
            OAuth error: {oauthResult}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">

            {/* Google OAuth */}
            <section className="border border-white/10 bg-white/5 rounded-xl p-6">
              <h2 className="font-semibold text-white mb-1">Google Photos Connection</h2>
              {settings?.oauth_connected ? (
                <p className="text-sm text-gray-400 mb-4">
                  ✓ Connected as <span className="font-medium text-gray-200">{settings.authorized_email}</span>
                </p>
              ) : (
                <p className="text-sm text-gray-500 mb-4">Not connected.</p>
              )}
              <button
                onClick={connectGoogle}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                {settings?.oauth_connected ? 'Re-connect Google Photos' : 'Connect Google Photos'}
              </button>
            </section>

            {/* Photo picker */}
            <section className="border border-white/10 bg-white/5 rounded-xl p-6">
              <h2 className="font-semibold text-white mb-1">Add Photos</h2>
              <p className="text-sm text-gray-400 mb-4">
                Opens Google's photo picker so you can choose which photos to include in the voting pool.
                You can run this multiple times to add more photos.
              </p>

              {!settings?.oauth_connected ? (
                <p className="text-sm text-amber-400">Connect Google Photos first.</p>
              ) : !session ? (
                <button
                  onClick={() => startSession.mutate()}
                  disabled={startSession.isPending}
                  className="px-4 py-2 text-sm bg-white/10 hover:bg-white/15 text-white rounded-lg disabled:opacity-40 transition-colors"
                >
                  {startSession.isPending ? 'Starting…' : 'Open Photo Picker'}
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-sm">
                    <p className="text-gray-400 mb-2">
                      Google's picker should have opened in a new tab. If not:
                    </p>
                    <a
                      href={session.picker_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline break-all text-xs font-mono"
                    >
                      Open Picker →
                    </a>
                  </div>

                  {!ready ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      Waiting for you to finish selecting photos…
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-green-400">
                      ✓ Photos selected — ready to import
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => importSession.mutate()}
                      disabled={!ready || importSession.isPending}
                      className="px-4 py-2 text-sm bg-white/10 hover:bg-white/15 text-white rounded-lg disabled:opacity-40 transition-colors"
                    >
                      {importSession.isPending ? 'Importing…' : 'Import Selected Photos'}
                    </button>
                    <button
                      onClick={() => setSession(null)}
                      className="px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {importResult && (
                <p className={`text-sm mt-4 ${importResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {importResult}
                </p>
              )}

              <p className="text-xs text-gray-600 mt-4">
                The picker is limited to 2000 photos per session. Run it multiple times to add more.
              </p>
            </section>

            {/* Photo pool */}
            <section className="border border-white/10 bg-white/5 rounded-xl p-6">
              <h2 className="font-semibold text-white mb-1">Photo Pool</h2>
              <p className="text-sm text-gray-400 mb-4">
                {settings?.photo_count
                  ? <><span className="font-medium text-white">{settings.photo_count}</span> photos in the voting pool.</>
                  : 'No photos in the voting pool yet.'}
              </p>

              {settings?.photo_count ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setRefreshResult(null); refreshPhotos.mutate() }}
                      disabled={refreshPhotos.isPending}
                      className="px-4 py-2 text-sm bg-white/10 hover:bg-white/15 text-white rounded-lg disabled:opacity-40 transition-colors"
                    >
                      {refreshPhotos.isPending ? 'Refreshing…' : 'Refresh Photo Metadata'}
                    </button>
                  </div>
                  {refreshResult && (
                    <p className={`text-sm ${refreshResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                      {refreshResult}
                    </p>
                  )}
                  <div className="border-t border-white/10 pt-3">
                    {confirmClear ? (
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-300">Delete all photos and votes?</span>
                        <button
                          onClick={() => clearPhotos.mutate()}
                          disabled={clearPhotos.isPending}
                          className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-40 transition-colors"
                        >
                          {clearPhotos.isPending ? 'Clearing…' : 'Yes, clear all'}
                        </button>
                        <button
                          onClick={() => setConfirmClear(false)}
                          className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmClear(true)}
                        className="px-4 py-2 text-sm border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                      >
                        Clear All Photos
                      </button>
                    )}
                  </div>
                </div>
              ) : null}
            </section>

            {/* Stats */}
            <section className="border border-white/10 bg-white/5 rounded-xl p-6">
              <h2 className="font-semibold text-white mb-4">Activity</h2>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-white">{stats?.total_users ?? '—'}</p>
                  <p className="text-xs text-gray-500 mt-1">Users</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-white">{stats?.total_votes ?? '—'}</p>
                  <p className="text-xs text-gray-500 mt-1">Total votes</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-white">{stats?.photos_voted_on ?? '—'}</p>
                  <p className="text-xs text-gray-500 mt-1">Photos rated</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-400">{stats?.upvotes ?? '—'}</p>
                  <p className="text-xs text-gray-500 mt-1">Upvotes</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-red-400">{stats?.downvotes ?? '—'}</p>
                  <p className="text-xs text-gray-500 mt-1">Downvotes</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-gray-400">{stats?.skips ?? '—'}</p>
                  <p className="text-xs text-gray-500 mt-1">Skips</p>
                </div>
              </div>

              <div className="flex gap-3 mb-6">
                <div className="flex-1 bg-white/5 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-white">
                    {stats != null ? `${stats.completion_pct.toFixed(1)}%` : '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Photos seen</p>
                </div>
                <div className="flex-1 bg-white/5 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-white">
                    {stats != null ? stats.avg_votes_per_photo.toFixed(1) : '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Avg votes / photo</p>
                </div>
              </div>

              {stats && stats.votes_per_user.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Votes per user</p>
                  <div className="flex flex-col gap-2">
                    {stats.votes_per_user.map((u) => (
                      <div key={u.email} className="flex items-center justify-between text-sm">
                        <div className="min-w-0">
                          <span className="text-gray-200 font-medium">{u.name || u.email}</span>
                          {u.name && <span className="text-gray-600 text-xs ml-2">{u.email}</span>}
                        </div>
                        <span className="text-gray-400 tabular-nums ml-4 flex-shrink-0">{u.vote_count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Danger zone */}
            <section className="border border-red-500/20 bg-red-500/5 rounded-xl p-6">
              <h2 className="font-semibold text-red-400 mb-1">Danger Zone</h2>
              <p className="text-sm text-gray-500 mb-5">
                Reset the site between events. Each action requires typing RESET to confirm.
              </p>

              {resetResult && (
                <div className={`mb-4 p-3 rounded-lg text-sm ${resetResult.startsWith('Error') ? 'bg-red-500/15 border border-red-500/30 text-red-400' : 'bg-green-500/15 border border-green-500/30 text-green-400'}`}>
                  {resetResult}
                </div>
              )}

              <div className="flex flex-col gap-3">
                {RESET_OPTIONS.map((opt, i) => (
                  <div
                    key={opt.scope}
                    className={`flex items-start justify-between gap-4 p-4 rounded-lg border ${
                      i === RESET_OPTIONS.length - 1
                        ? 'border-red-500/30 bg-red-500/5'
                        : 'border-white/8 bg-white/3'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-200">{opt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
                    </div>
                    <button
                      onClick={() => { setResetResult(null); setActiveReset(opt.scope) }}
                      className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                        i === RESET_OPTIONS.length - 1
                          ? 'border-red-500/50 text-red-400 hover:bg-red-500/15'
                          : 'border-white/15 text-gray-400 hover:bg-white/8 hover:text-white'
                      }`}
                    >
                      Reset
                    </button>
                  </div>
                ))}
              </div>
            </section>

          </div>
        )}
      </div>

      {activeResetOption && (
        <ResetModal
          option={activeResetOption}
          onClose={() => setActiveReset(null)}
          onConfirm={() => resetMutation.mutate(activeResetOption.scope)}
          isPending={resetMutation.isPending}
        />
      )}
    </div>
  )
}
