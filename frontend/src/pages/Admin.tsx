import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import api from '../api/client'

interface Settings {
  oauth_connected: boolean
  authorized_email: string
  photo_count: number
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

  const { data: settings, isLoading, refetch: refetchSettings } = useQuery<Settings>({
    queryKey: ['adminSettings'],
    queryFn: () => api.get('/admin/settings').then((r) => r.data),
  })

  const clearPhotos = useMutation({
    mutationFn: () => api.delete('/admin/photos'),
    onSuccess: () => { setConfirmClear(false); refetchSettings() },
  })

  // Poll session status every 4s until photos are selected
  const { data: sessionStatus } = useQuery<PickerSession>({
    queryKey: ['pickerSession', session?.session_id],
    queryFn: () =>
      api.get(`/admin/picker/session/${session!.session_id}`).then((r) => r.data),
    enabled: !!session && !session.media_items_set,
    refetchInterval: 4000,
    refetchIntervalInBackground: true,
    onSuccess: (data: PickerSession) => {
      if (data.media_items_set) setSession(data)
    },
  })

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
    <div className="max-w-xl mx-auto px-6 py-10">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Admin Settings</h1>
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-800">← Back</Link>
      </div>

      {oauthResult === 'connected' && (
        <div className="mb-6 p-3 bg-green-50 text-green-700 rounded-lg text-sm">
          Google Photos connected successfully.
        </div>
      )}
      {oauthResult && oauthResult !== 'connected' && (
        <div className="mb-6 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          OAuth error: {oauthResult}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-8">

          {/* Google OAuth */}
          <section className="border rounded-xl p-6">
            <h2 className="font-semibold mb-1">Google Photos Connection</h2>
            {settings?.oauth_connected ? (
              <p className="text-sm text-gray-500 mb-4">
                ✓ Connected as <span className="font-medium text-gray-700">{settings.authorized_email}</span>
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
          <section className="border rounded-xl p-6">
            <h2 className="font-semibold mb-1">Add Photos</h2>
            <p className="text-sm text-gray-500 mb-4">
              Opens Google's photo picker so you can choose which photos to include in the voting pool.
              You can run this multiple times to add more photos.
            </p>

            {!settings?.oauth_connected ? (
              <p className="text-sm text-amber-600">Connect Google Photos first.</p>
            ) : !session ? (
              <button
                onClick={() => startSession.mutate()}
                disabled={startSession.isPending}
                className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-40 transition-colors"
              >
                {startSession.isPending ? 'Starting…' : 'Open Photo Picker'}
              </button>
            ) : (
              <div className="space-y-4">
                {/* Picker link (in case the new tab was blocked) */}
                <div className="p-3 bg-gray-50 rounded-lg text-sm">
                  <p className="text-gray-600 mb-2">
                    Google's picker should have opened in a new tab.
                    If not, use this link:
                  </p>
                  <a
                    href={session.picker_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline break-all text-xs font-mono"
                  >
                    Open Picker →
                  </a>
                </div>

                {/* Status */}
                {!ready ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    Waiting for you to finish selecting photos…
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    ✓ Photos selected — ready to import
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => importSession.mutate()}
                    disabled={!ready || importSession.isPending}
                    className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-40 transition-colors"
                  >
                    {importSession.isPending ? 'Importing…' : 'Import Selected Photos'}
                  </button>
                  <button
                    onClick={() => setSession(null)}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {importResult && (
              <p className={`text-sm mt-4 ${importResult.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {importResult}
              </p>
            )}

            <p className="text-xs text-gray-400 mt-4">
              The picker is limited to 2000 photos per session. Run it multiple times to add more.
            </p>
          </section>

          {/* Photo pool */}
          <section className="border rounded-xl p-6">
            <h2 className="font-semibold mb-1">Photo Pool</h2>
            <p className="text-sm text-gray-500 mb-4">
              {settings?.photo_count
                ? <><span className="font-medium text-gray-700">{settings.photo_count}</span> photos in the voting pool.</>
                : 'No photos in the voting pool yet.'}
            </p>

            {settings?.photo_count ? (
              confirmClear ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-600">Delete all photos and votes?</span>
                  <button
                    onClick={() => clearPhotos.mutate()}
                    disabled={clearPhotos.isPending}
                    className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-40 transition-colors"
                  >
                    {clearPhotos.isPending ? 'Clearing…' : 'Yes, clear all'}
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="text-sm text-gray-400 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  Clear All Photos
                </button>
              )
            ) : null}
          </section>

        </div>
      )}
    </div>
  )
}
