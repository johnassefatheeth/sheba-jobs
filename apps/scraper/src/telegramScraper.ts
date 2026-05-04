import 'dotenv/config'
import { prisma } from '@sheba/db'
// Example: gramjs usage
// This file is a starting point — configure your Telegram API credentials in .env

async function runTelegramScraper() {
  console.log('Telegram scraper starting (example)')

  // Pseudocode / example: connect with gramjs, iterate messages from channels,
  // parse job posts and upsert into DB.

  // For each extracted job:
  const exampleJob = {
    title: 'Frontend Developer (Remote)',
    company: 'Acme Ltd',
    location: 'Addis Ababa',
    category: 'Engineering',
    description: 'We are hiring a frontend dev...',
    source: 'telegram',
    sourceUrl: 'https://t.me/example/123',
    applyUrl: 'https://acme.example/apply',
    postedAt: new Date()
  }

  try {
    // deduplicate using unique constraint (title + sourceUrl)
    await prisma.job.upsert({
      where: { title_sourceUrl_unique: { title: exampleJob.title, sourceUrl: exampleJob.sourceUrl } },
      update: { description: exampleJob.description, postedAt: exampleJob.postedAt },
      create: exampleJob as any
    })
    console.log('Upserted example job')
  } catch (err) {
    console.error('DB error', err)
  }
}

runTelegramScraper().catch(err=>{console.error(err);process.exit(1)})
