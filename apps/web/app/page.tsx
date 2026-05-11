"use client"
import React, { useEffect, useState } from 'react'
import Loading from './components/Loading'

type Job = {
  id: string
  title: string
  company?: string
  location?: string
  category?: string
  postedAt?: string
  posterType?: string
  jobType?: string
  experienceLevel?: string
  educationLevel?: string
  isRemote?: boolean
  isInternship?: boolean
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
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('')
  const [posterType, setPosterType] = useState('')
  const [jobType, setJobType] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')
  const [educationLevel, setEducationLevel] = useState('')
  const [isRemote, setIsRemote] = useState(false)
  const [isInternship, setIsInternship] = useState(false)
  const [includeExpired, setIncludeExpired] = useState(false)
  const [categories, setCategories] = useState<string[]>([])
  const [posterTypes, setPosterTypes] = useState<string[]>([])
  const [jobTypes, setJobTypes] = useState<string[]>([])
  const [experienceLevels, setExperienceLevels] = useState<string[]>([])
  const [educationLevels, setEducationLevels] = useState<string[]>([])

  async function load() {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (location) params.set('location', location)
    if (category) params.set('category', category)
    if (posterType) params.set('posterType', posterType)
    if (jobType) params.set('jobType', jobType)
    if (experienceLevel) params.set('experienceLevel', experienceLevel)
    if (educationLevel) params.set('educationLevel', educationLevel)
    if (isRemote) params.set('isRemote', 'true')
    if (isInternship) params.set('isInternship', 'true')
    if (includeExpired) params.set('includeExpired', 'true')

    setLoadError(null)
    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/jobs?` + params.toString())
      const data = await res.json()
      if (!res.ok) {
        setJobs([])
        setLoadError(typeof data?.error === 'string' ? data.error : 'Could not load jobs')
        setLoading(false)
        return
      }
      const list = Array.isArray(data) ? data : []
      setJobs(list)

      // derive options from returned jobs for dropdowns
      const unique = (arr: (string|undefined)[]) => Array.from(new Set(arr.filter(Boolean) as string[])).sort()
      setCategories(unique(list.map(j => j.category)))
      setPosterTypes(unique(list.map(j => j.posterType)))
      setJobTypes(unique(list.map(j => j.jobType)))
      setExperienceLevels(unique(list.map(j => j.experienceLevel)))
      setEducationLevels(unique(list.map(j => j.educationLevel)))

      setLoadError(null)
    } catch (err) {
      setJobs([])
      setLoadError('Could not load jobs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="filters">
        <input className="search" placeholder="Search jobs" value={search} onChange={(e)=>setSearch(e.target.value)} />
        <input placeholder="Location" value={location} onChange={(e)=>setLocation(e.target.value)} />

        <select value={category} onChange={(e)=>setCategory(e.target.value)}>
          <option value="">Any category</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={posterType} onChange={(e)=>setPosterType(e.target.value)}>
          <option value="">Any poster</option>
          {posterTypes.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={jobType} onChange={(e)=>setJobType(e.target.value)}>
          <option value="">Any job type</option>
          {jobTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={experienceLevel} onChange={(e)=>setExperienceLevel(e.target.value)}>
          <option value="">Any experience</option>
          {experienceLevels.map(x => <option key={x} value={x}>{x}</option>)}
        </select>

        <select value={educationLevel} onChange={(e)=>setEducationLevel(e.target.value)}>
          <option value="">Any education</option>
          {educationLevels.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <label className="small-toggle">
          <input type="checkbox" checked={isRemote} onChange={(e)=>setIsRemote(e.target.checked)} />
          Remote
        </label>
        <label className="small-toggle">
          <input type="checkbox" checked={isInternship} onChange={(e)=>setIsInternship(e.target.checked)} />
          Internship
        </label>
        <label className="small-toggle">
          <input type="checkbox" checked={includeExpired} onChange={(e)=>setIncludeExpired(e.target.checked)} />
          Include expired
        </label>

        <button onClick={load} aria-label="Filter">Filter</button>
        <button onClick={() => { setSearch(''); setLocation(''); setCategory(''); setPosterType(''); setJobType(''); setExperienceLevel(''); setEducationLevel(''); setIsRemote(false); setIsInternship(false); setIncludeExpired(false); }} style={{background:'transparent',color:'var(--muted)',border:'none',cursor:'pointer'}}>Clear</button>
      </div>

      <section>
        {loadError && (
          <p style={{ color: '#b91c1c', marginBottom: '1rem' }}>{loadError}</p>
        )}

        {loading ? (
          <Loading count={4} />
        ) : (
          <div className="job-list">
            {jobs.length === 0 && <p style={{color: 'var(--muted)'}}>No jobs found.</p>}
            {jobs.map(job => (
              <div key={job.id} className="job-card">
                <a href={`/job/${job.id}`} className="job-title">{job.title}</a>
                <div style={{marginTop:'.25rem',color:'var(--muted)'}}>{job.company || '—'} • {job.location || '—'} • {job.category || '—'}</div>
                <div style={{marginTop:'.35rem',fontSize:'.88rem',color:varToString('var(--muted)')}}>
                  {job.posterType || '—'} • {job.jobType || '—'} • {job.experienceLevel || '—'} • {job.educationLevel || '—'}
                  {job.isRemote ? ' • Remote' : ''}{job.isInternship ? ' • Internship' : ''}
                </div>
                <div style={{marginTop:'.5rem',fontSize:'.9rem',color:'#475569'}}>
                  Posted: {job.postedAt ? new Date(job.postedAt).toLocaleString() : '—'} ({timeAgo(job.postedAt)})
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// helper for inline style color usage without breaking TSX template
function varToString(v: string) { return v }
