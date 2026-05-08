"use client"
import React, { useEffect, useState } from 'react'

type Job = {
  id: string
  title: string
  company?: string
  location?: string
  category?: string
  postedAt?: string
}

function timeAgo(value?: string) {
  if (!value) return '—'
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return '—'
  const diffMs = Date.now() - ts
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(months / 12)
  return `${years}y ago`
}

export default function Page() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('')

  async function load() {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (location) params.set('location', location)
    if (category) params.set('category', category)

    setLoadError(null)
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/jobs?` + params.toString())
    const data = await res.json()
    if (!res.ok) {
      setJobs([])
      setLoadError(typeof data?.error === 'string' ? data.error : 'Could not load jobs')
      return
    }
    setJobs(Array.isArray(data) ? data : [])
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="filters">
        <input className="search" placeholder="Search jobs" value={search} onChange={(e)=>setSearch(e.target.value)} />
        <input placeholder="Location" value={location} onChange={(e)=>setLocation(e.target.value)} />
        <input placeholder="Category" value={category} onChange={(e)=>setCategory(e.target.value)} />
        <button onClick={load}>Filter</button>
      </div>

      <section>
        {loadError && (
          <p style={{ color: '#b91c1c', marginBottom: '1rem' }}>{loadError}</p>
        )}
        {jobs.map(job => (
          <div key={job.id} className="job-card">
            <a href={`/job/${job.id}`} className="job-title">{job.title}</a>
            <div>{job.company} • {job.location} • {job.category}</div>
            <div style={{marginTop:'.5rem',fontSize:'.9rem',color:'#475569'}}>
              Posted: {job.postedAt ? new Date(job.postedAt).toLocaleString() : '—'} ({timeAgo(job.postedAt)})
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
