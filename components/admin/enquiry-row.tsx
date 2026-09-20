'use client'

import { useState, useTransition } from 'react'
import { updateEnquiryAction, deleteEnquiryAction } from '@/lib/admin/actions'

export function EnquiryRow({
  enquiry,
}: {
  enquiry: {
    id: string
    name: string
    email: string
    phone: string
    message: string | null
    status: string
    notes: string | null
    createdAt: string
  }
}) {
  const [pending, start] = useTransition()
  const [notes, setNotes] = useState(enquiry.notes ?? '')
  const [status, setStatus] = useState(enquiry.status)
  const [saved, setSaved] = useState(false)

  function save(nextStatus: string) {
    const formData = new FormData()
    formData.set('id', enquiry.id)
    formData.set('status', nextStatus)
    formData.set('notes', notes)
    setSaved(false)
    start(async () => {
      const result = await updateEnquiryAction(formData)
      if (result.ok) {
        setStatus(nextStatus)
        setSaved(true)
      }
    })
  }

  return (
    <div className="px-5 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[1.0625rem] font-medium text-ink">{enquiry.name}</p>
          <p className="mt-1 flex flex-wrap gap-x-4 text-[0.875rem]">
            <a href={`tel:${enquiry.phone}`} className="figure text-body underline underline-offset-4">
              {enquiry.phone}
            </a>
            <a href={`mailto:${enquiry.email}`} className="text-body underline underline-offset-4">
              {enquiry.email}
            </a>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="mono-sm border border-line-strong px-2 py-1 text-muted">{status}</span>
          <span className="mono-sm text-faint">
            {new Date(enquiry.createdAt).toLocaleString('en-SG', {
              timeZone: 'Asia/Singapore',
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        </div>
      </div>

      {enquiry.message ? (
        <p className="mt-4 whitespace-pre-wrap border-l-2 border-line-strong bg-veil px-4 py-3 text-[0.9375rem] leading-relaxed text-body">
          {enquiry.message}
        </p>
      ) : (
        <p className="mono-sm mt-4 text-faint">No message left.</p>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex-1">
          <span className="mono-sm text-faint">Internal notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1.5 h-10 w-full border border-line-strong px-3 text-[0.875rem] focus:border-ink focus:outline-none"
          />
        </label>

        <div className="flex gap-2">
          {(['CONTACTED', 'CLOSED', 'SPAM'] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => save(s)}
              className="h-10 border border-line-strong px-3 text-[0.8125rem] transition-colors hover:border-ink disabled:opacity-40"
            >
              {s === 'CONTACTED' ? 'Contacted' : s === 'CLOSED' ? 'Close' : 'Spam'}
            </button>
          ))}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!window.confirm('Delete this enquiry? This cannot be undone.')) return
              const formData = new FormData()
              formData.set('id', enquiry.id)
              start(async () => {
                await deleteEnquiryAction(formData)
              })
            }}
            className="h-10 border border-[#9c3b2b]/40 px-3 text-[0.8125rem] text-[#9c3b2b] transition-colors hover:bg-[#9c3b2b]/5 disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>

      {saved ? <p className="mono-sm mt-3 text-[#1f5d4c]">Saved.</p> : null}
    </div>
  )
}
