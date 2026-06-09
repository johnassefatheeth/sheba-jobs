"use client"
import React, { useCallback, useEffect, useState } from 'react'
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

type FacetOption = { value: string; count: number }

type JobMeta = {
  global: { totalActive: number; postedToday: number }
  filtered: { total: number; postedToday: number }
  facets: {
    categories: FacetOption[]
    posterTypes: FacetOption[]
    jobTypes: FacetOption[]
    experienceLevels: FacetOption[]
    educationLevels: FacetOption[]
    scrapeSites: FacetOption[]
  }
}

type JobsResponse = {
  jobs: Job[]
  total: number
  postedToday: number
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

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

function buildParams(state: {
  search: string
  location: string
  category: string
  posterType: string
  jobType: string
  experienceLevel: string
  educationLevel: string
  isRemote: boolean
  isInternship: boolean
  includeExpired: boolean
  scrapedFrom: string
}) {
  const params = new URLSearchParams()
  if (state.search) params.set('search', state.search)
  if (state.location) params.set('location', state.location)
  if (state.category) params.set('category', state.category)
  if (state.posterType) params.set('posterType', state.posterType)
  if (state.jobType) params.set('jobType', state.jobType)
  if (state.experienceLevel) params.set('experienceLevel', state.experienceLevel)
  if (state.educationLevel) params.set('educationLevel', state.educationLevel)
  if (state.isRemote) params.set('isRemote', 'true')
  if (state.isInternship) params.set('isInternship', 'true')
  if (state.includeExpired) params.set('includeExpired', 'true')
  if (state.scrapedFrom) params.set('scrapedFrom', state.scrapedFrom)
  return params
}

function hasActiveFilters(state: {
  search: string
  location: string
  category: string
  posterType: string
  jobType: string
  experienceLevel: string
  educationLevel: string
  isRemote: boolean
  isInternship: boolean
  scrapedFrom: string
}) {
  return Boolean(
    state.search ||
      state.location ||
      state.category ||
      state.posterType ||
      state.jobType ||
      state.experienceLevel ||
      state.educationLevel ||
      state.scrapedFrom ||
      state.isRemote ||
      state.isInternship
  )
}

function formatOption(label: string, count?: number) {
  if (count === undefined) return label
  return `${label} (${count})`
}

export default function Page() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [meta, setMeta] = useState<JobMeta | null>(null)
  const [filteredTotal, setFilteredTotal] = useState(0)
  const [filteredPostedToday, setFilteredPostedToday] = useState(0)
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
  const [scrapedFrom, setScrapedFrom] = useState('')

  const filterState = {
    search,
    location,
    category,
    posterType,
    jobType,
    experienceLevel,
    educationLevel,
    isRemote,
    isInternship,
    includeExpired,
    scrapedFrom,
  }

  const load = useCallback(async (overrides: Partial<typeof filterState> = {}) => {
    const params = buildParams({ ...filterState, ...overrides })
    setLoadError(null)
    setLoading(true)
    try {
      const [jobsRes, metaRes] = await Promise.all([
        fetch(`${API_BASE}/jobs?${params.toString()}`),
        fetch(`${API_BASE}/jobs/meta?${params.toString()}`),
      ])

      const jobsData = await jobsRes.json()
      const metaData = await metaRes.json()

      if (!jobsRes.ok) {
        setJobs([])
        setLoadError(typeof jobsData?.error === 'string' ? jobsData.error : 'Could not load jobs')
        return
      }

      const payload = jobsData as JobsResponse | Job[]
      const list = Array.isArray(payload) ? payload : payload.jobs ?? []
      setJobs(list)
      setFilteredTotal(Array.isArray(payload) ? list.length : payload.total ?? list.length)
      setFilteredPostedToday(Array.isArray(payload) ? 0 : payload.postedToday ?? 0)

      if (metaRes.ok) {
        setMeta(metaData as JobMeta)
      }

      setLoadError(null)
    } catch {
      setJobs([])
      setLoadError('Could not load jobs')
    } finally {
      setLoading(false)
    }
  }, [
    search,
    location,
    category,
    posterType,
    jobType,
    experienceLevel,
    educationLevel,
    isRemote,
    isInternship,
    includeExpired,
    scrapedFrom,
  ])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [])

  const filtersActive = hasActiveFilters(filterState)

  const applyFilter = (patch: Partial<typeof filterState>) => {
    if (patch.search !== undefined) setSearch(patch.search)
    if (patch.location !== undefined) setLocation(patch.location)
    if (patch.category !== undefined) setCategory(patch.category)
    if (patch.posterType !== undefined) setPosterType(patch.posterType)
    if (patch.jobType !== undefined) setJobType(patch.jobType)
    if (patch.experienceLevel !== undefined) setExperienceLevel(patch.experienceLevel)
    if (patch.educationLevel !== undefined) setEducationLevel(patch.educationLevel)
    if (patch.scrapedFrom !== undefined) setScrapedFrom(patch.scrapedFrom)
    if (patch.isRemote !== undefined) setIsRemote(patch.isRemote)
    if (patch.isInternship !== undefined) setIsInternship(patch.isInternship)
    if (patch.includeExpired !== undefined) setIncludeExpired(patch.includeExpired)
    void load(patch)
  }
  const facets = meta?.facets

  function clearFilters() {
    setSearch('')
    setLocation('')
    setCategory('')
    setPosterType('')
    setJobType('')
    setExperienceLevel('')
    setEducationLevel('')
    setScrapedFrom('')
    setIsRemote(false)
    setIsInternship(false)
    setIncludeExpired(false)
    void load({
      search: '',
      location: '',
      category: '',
      posterType: '',
      jobType: '',
      experienceLevel: '',
      educationLevel: '',
      scrapedFrom: '',
      isRemote: false,
      isInternship: false,
      includeExpired: false,
    })
  }

  return (
    <div>
      {meta && (
        <div className="job-stats">
          <div className="job-stat">
            <span className="job-stat-value">{meta.global.totalActive.toLocaleString()}</span>
            <span className="job-stat-label">active jobs</span>
          </div>
          <div className="job-stat">
            <span className="job-stat-value">{meta.global.postedToday.toLocaleString()}</span>
            <span className="job-stat-label">posted today</span>
          </div>
          {filtersActive && (
            <div className="job-stat job-stat-filtered">
              <span className="job-stat-value">{filteredTotal.toLocaleString()}</span>
              <span className="job-stat-label">matching filters</span>
              {filteredPostedToday > 0 && (
                <span className="job-stat-sub">{filteredPostedToday.toLocaleString()} posted today</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="filters">
        <input className="search" placeholder="Search jobs" value={search} onChange={(e)=>setSearch(e.target.value)} />
        <input placeholder="Location" value={location} onChange={(e)=>setLocation(e.target.value)} />

        <select value={category} onChange={(e)=>applyFilter({ category: e.target.value })}>
          <option value="">{formatOption('Any field', facets?.categories.reduce((s, o) => s + o.count, 0))}</option>
          {(facets?.categories ?? []).map(c => (
            <option key={c.value} value={c.value}>{formatOption(c.value, c.count)}</option>
          ))}
        </select>

        <select value={posterType} onChange={(e)=>applyFilter({ posterType: e.target.value })}>
          <option value="">{formatOption('Any employer type', facets?.posterTypes.reduce((s, o) => s + o.count, 0))}</option>
          {(facets?.posterTypes ?? []).map(p => (
            <option key={p.value} value={p.value}>{formatOption(p.value, p.count)}</option>
          ))}
        </select>

        <select value={jobType} onChange={(e)=>applyFilter({ jobType: e.target.value })}>
          <option value="">{formatOption('Any employment type', facets?.jobTypes.reduce((s, o) => s + o.count, 0))}</option>
          {(facets?.jobTypes ?? []).map(t => (
            <option key={t.value} value={t.value}>{formatOption(t.value, t.count)}</option>
          ))}
        </select>

        <select value={experienceLevel} onChange={(e)=>applyFilter({ experienceLevel: e.target.value })}>
          <option value="">{formatOption('Any experience', facets?.experienceLevels.reduce((s, o) => s + o.count, 0))}</option>
          {(facets?.experienceLevels ?? []).map(x => (
            <option key={x.value} value={x.value}>{formatOption(x.value, x.count)}</option>
          ))}
        </select>

        <select value={educationLevel} onChange={(e)=>applyFilter({ educationLevel: e.target.value })}>
          <option value="">{formatOption('Any education', facets?.educationLevels.reduce((s, o) => s + o.count, 0))}</option>
          {(facets?.educationLevels ?? []).map(s => (
            <option key={s.value} value={s.value}>{formatOption(s.value, s.count)}</option>
          ))}
        </select>

        <select value={scrapedFrom} onChange={(e)=>applyFilter({ scrapedFrom: e.target.value })}>
          <option value="">{formatOption('Any source site', facets?.scrapeSites.reduce((s, o) => s + o.count, 0))}</option>
          {(facets?.scrapeSites ?? []).map(s => (
            <option key={s.value} value={s.value}>{formatOption(s.value, s.count)}</option>
          ))}
        </select>

        <label className="small-toggle">
          <input type="checkbox" checked={isRemote} onChange={(e)=>applyFilter({ isRemote: e.target.checked })} />
          Remote
        </label>
        <label className="small-toggle">
          <input type="checkbox" checked={isInternship} onChange={(e)=>applyFilter({ isInternship: e.target.checked })} />
          Internship
        </label>
        <label className="small-toggle">
          <input type="checkbox" checked={includeExpired} onChange={(e)=>applyFilter({ includeExpired: e.target.checked })} />
          Include expired
        </label>

        <button onClick={() => void load()} aria-label="Filter">Filter</button>
        <button type="button" onClick={clearFilters} className="btn-clear">Clear</button>
      </div>

      <section>
        {loadError && (
          <p className="load-error">{loadError}</p>
        )}

        {!loading && !loadError && (
          <p className="results-summary">
            Showing {jobs.length.toLocaleString()} of {filteredTotal.toLocaleString()} job{filteredTotal === 1 ? '' : 's'}
            {filtersActive ? ' matching your filters' : ''}
            {filteredPostedToday > 0 ? ` · ${filteredPostedToday.toLocaleString()} posted today` : ''}
          </p>
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
                <div style={{marginTop:'.35rem',fontSize:'.88rem',color:'var(--muted)'}}>
                  {job.posterType ? `${job.posterType}` : '—'}
                  {job.jobType ? ` • ${job.jobType}` : ''}
                  {job.experienceLevel ? ` • ${job.experienceLevel}` : ''}
                  {job.educationLevel ? ` • ${job.educationLevel}` : ''}
                  {job.isRemote ? ' • Remote' : ''}
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
