import React from 'react'

type Job = {
  id: string
  title: string
  company?: string
  location?: string
  category?: string
  description?: string
  applyUrl?: string
  scrapedFrom?: string
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

async function getJob(id: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/jobs/${id}`)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}

export default async function JobPage({ params }: { params: { id: string } }) {
  const job: Job = await getJob(params.id)
  const description = job.description ?? ''
  const hasHtml = /<[^>]+>/.test(description)

  return (
    <article>
      <h2>{job.title}</h2>
      <div>{job.company} • {job.location}</div>
      {job.scrapedFrom && (
        <p style={{ marginTop: '.5rem', fontSize: '.9rem', color: '#0f766e' }}>
          Scraped from: {job.scrapedFrom}
        </p>
      )}
      {hasHtml ? (
        <div
          style={{ marginTop: '1rem' }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(description) }}
        />
      ) : (
        <p style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>{description}</p>
      )}
      <div style={{marginTop:'1rem'}}>
        <a className="apply-btn" href={job.applyUrl} target="_blank" rel="noreferrer">Apply</a>
      </div>
    </article>
  )
}
