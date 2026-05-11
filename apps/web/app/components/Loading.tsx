"use client"
import React from 'react'

export default function Loading({ count = 3 }: { count?: number }) {
  return (
    <div className="loading-center">
      <svg className="svg-loader" viewBox="0 0 50 50" aria-hidden>
        <defs>
          <linearGradient id="g" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#0369a1" />
            <stop offset="50%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
        </defs>
        <circle cx="25" cy="25" r="20" stroke="url(#g)" strokeWidth="4" strokeLinecap="round" fill="none" strokeDasharray="31.4 31.4">
          <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
        </circle>
      </svg>

      <div style={{width:'100%',maxWidth:900}}>
        {Array.from({length: count}).map((_, i) => (
          <div key={i} style={{marginBottom:'.75rem'}}>
            <div className="skeleton card" />
          </div>
        ))}
      </div>
    </div>
  )
}
