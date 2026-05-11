import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
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

export default function Admin() {
  const [searchParams] = useSearchParams()
  const oauthResult = searchParams.get('connected') ? 'connected' : searchParams.get('error') ?? null

  const [session, setSession] = useState<PickerSession | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [refreshResult, setRefreshResult] = useState<string | null>(null)

  const { data: settings, isLoading, refetch: refetchSettings } = useQuery<Settings>({
    queryKey: ['adminSettings'],
    queryFn: () => api.get('/admin/settings').then((r) => r.data),
  })

  const { data: stats } = useQuery<Stats>({
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

  const connectGoogle = async () => {
    const res = await api.get('/admin/auth/google/url')
    window.location.href = res.data.url
  }

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

          </div>
        )}
      </div>
    </div>
  )
}
