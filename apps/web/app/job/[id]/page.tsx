import React from 'react'

type Job = {
  id: string
  title: string
  company?: string
  location?: string
  category?: string
  description?: string
  applyUrl?: string
}

async function getJob(id: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/jobs/${id}`)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}

export default async function JobPage({ params }: { params: { id: string } }) {
  const job: Job = await getJob(params.id)

  return (
    <article>
      <h2>{job.title}</h2>
      <div>{job.company} • {job.location}</div>
      <p style={{whiteSpace:'pre-wrap',marginTop:'1rem'}}>{job.description}</p>
      <div style={{marginTop:'1rem'}}>
        <a className="apply-btn" href={job.applyUrl} target="_blank" rel="noreferrer">Apply</a>
      </div>
    </article>
  )
}
