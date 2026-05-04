import 'dotenv/config'
import { chromium } from 'playwright'
import { prisma } from '@sheba/db'

async function runWebsiteScraper() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  // Example: replace with a real job site URL
  const LISTING_URL = 'https://example.com/jobs'

  await page.goto(LISTING_URL, { waitUntil: 'networkidle' })

  // This is a placeholder selector; adapt to the target site structure.
  const jobs = await page.$$eval('.job-item', (nodes: any[]) => nodes.map(n => ({
    title: n.querySelector('.title')?.textContent?.trim(),
    company: n.querySelector('.company')?.textContent?.trim(),
    location: n.querySelector('.location')?.textContent?.trim(),
    applyUrl: n.querySelector('a')?.href
  })))

  for (const j of jobs) {
    if (!j.title) continue
    try {
      await prisma.job.upsert({
        where: { title_sourceUrl_unique: { title: j.title, sourceUrl: j.applyUrl } },
        update: { company: j.company, location: j.location },
        create: {
          title: j.title,
          company: j.company,
          location: j.location,
          category: 'General',
          description: '',
          source: 'website',
          sourceUrl: j.applyUrl,
          applyUrl: j.applyUrl,
          postedAt: new Date()
        }
      })
      console.log('Saved', j.title)
    } catch (err) {
      console.error('save error', err)
    }
  }

  await browser.close()
}

runWebsiteScraper().catch(err=>{console.error(err);process.exit(1)})
