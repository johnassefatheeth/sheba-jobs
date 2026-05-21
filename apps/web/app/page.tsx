"use client"
import React, { useEffect, useState } from 'react'
import Loading from './components/Loading'

type Job = {
  id: string
  slug?: string
  title: string
  company?: string
  location?: string
  category?: string
  postedAt?: string
  freshness?: string
  posterType?: string
  jobType?: string
  experienceLevel?: string
  educationLevel?: string
  isRemote?: boolean
  isInternship?: boolean
  scrapedFrom?: string
}

function displayFreshness(job: Job) {
  if (job.freshness) return job.freshness
  if (!job.postedAt) return '—'
  const ts = new Date(job.postedAt).getTime()
  if (Number.isNaN(ts)) return '—'
  const dayDiff = Math.floor((Date.now() - ts) / 86_400_000)
  if (dayDiff <= 0) return 'Today'
  if (dayDiff === 1) return 'Yesterday'
  return `${dayDiff} days ago`
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
  const [scrapedFrom, setScrapedFrom] = useState('')
  const [scrapeSites, setScrapeSites] = useState<string[]>([])

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
    if (scrapedFrom) params.set('scrapedFrom', scrapedFrom)

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
      const sites = new Set<string>()
      for (const j of list) {
        if (!j.scrapedFrom) continue
        for (const part of j.scrapedFrom.split(',')) {
          const t = part.trim()
          if (t) sites.add(t)
        }
      }
      setScrapeSites(Array.from(sites).sort())

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

        <select value={scrapedFrom} onChange={(e)=>setScrapedFrom(e.target.value)}>
          <option value="">Any source site</option>
          {scrapeSites.map(s => <option key={s} value={s}>{s}</option>)}
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
        <button onClick={() => { setSearch(''); setLocation(''); setCategory(''); setPosterType(''); setJobType(''); setExperienceLevel(''); setEducationLevel(''); setScrapedFrom(''); setIsRemote(false); setIsInternship(false); setIncludeExpired(false); }} style={{background:'transparent',color:'var(--muted)',border:'none',cursor:'pointer'}}>Clear</button>
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
                <a href={`/jobs/${job.slug || job.id}`} className="job-title">{job.title}</a>
                <div style={{marginTop:'.25rem',color:'var(--muted)'}}>{job.company || '—'} • {job.location || '—'} • {job.category || '—'}</div>
                {job.scrapedFrom && (
                  <div style={{marginTop:'.25rem',fontSize:'.82rem',color:'var(--accent, #0f766e)'}}>
                    From: {job.scrapedFrom}
                  </div>
                )}
                <div style={{marginTop:'.35rem',fontSize:'.88rem',color:varToString('var(--muted)')}}>
                  {job.posterType || '—'} • {job.jobType || '—'} • {job.experienceLevel || '—'} • {job.educationLevel || '—'}
                  {job.isRemote ? ' • Remote' : ''}{job.isInternship ? ' • Internship' : ''}
                </div>
                <div style={{marginTop:'.5rem',fontSize:'.9rem',color:'#475569'}}>
                  Posted {displayFreshness(job)}
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
