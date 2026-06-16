// main.js
// Scrapes Naukri search result pages and saves to jobs.json

const { PlaywrightCrawler } = require('crawlee');
const fs = require('fs');

// ─── PREFERENCES ────────────────────────────────────────────
const preferences = {
  roles: [
    'power-bi',
    'data-analyst',
    'business-analyst',
    'analytics-consultant',
  ],
  locations: [
    'bangalore',
    'hyderabad',
    'remote',
  ],
  jobAgeDays: 3,          // last 3 days
  maxJobsPerSearch: 20,
};

// ─── TITLE FILTER ────────────────────────────────────────────
// A job title must contain AT LEAST ONE of these words/phrases
// (case-insensitive) to be kept. Anything else gets dropped.
const ALLOWED_TITLE_KEYWORDS = [
  'power bi',
  'data analyst',
  'data analysis',
  'business analyst',
  'analytics',
  'sql',
  'bi analyst',
  'reporting analyst',
  'mis analyst',
  'tableau',
];

function isTitleRelevant(title) {
  const lower = title.toLowerCase();
  return ALLOWED_TITLE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── ROBUST JOB ID EXTRACTION ────────────────────────────────
// Strips query params first (?source=...) then takes the trailing
// numeric segment from the URL. This ensures the same job always
// produces the same job_id across multiple runs — critical for
// Postgres deduplication via ON CONFLICT (job_id) DO NOTHING.
//
// Example URL:
//   https://www.naukri.com/job-listings/data-analyst-xyz-bangalore-240614500123456?source=jobsearchDesk
//   → cleanUrl  : ...data-analyst-xyz-bangalore-240614500123456
//   → lastSegment: 240614500123456
//   → job_id    : "240614500123456"  ✅ stable across every run
function extractJobId(rawUrl) {
  if (!rawUrl) return '';
  const cleanUrl    = rawUrl.split('?')[0];          // remove query string
  const lastSegment = cleanUrl.split('-').pop() || ''; // take last hyphen segment
  const numericId   = lastSegment.replace(/\D/g, ''); // strip any non-digits
  return numericId;
}
// ────────────────────────────────────────────────────────────

// ─── BUILD SEARCH URLS ───────────────────────────────────────
const urls = [];
for (const role of preferences.roles) {
  for (const location of preferences.locations) {
    urls.push(
      `https://www.naukri.com/${role}-jobs-in-${location}?jobAge=${preferences.jobAgeDays}`
    );
  }
}

console.log(`\nBuilt ${urls.length} search URLs`);
urls.forEach((u) => console.log(`  ${u}`));
console.log('');
// ────────────────────────────────────────────────────────────

const allJobs = [];

const crawler = new PlaywrightCrawler({
  launchContext: {
    launchOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    },
  },

  preNavigationHooks: [
    async ({ page }) => {
      await page.setExtraHTTPHeaders({
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/124.0.0.0 Safari/537.36',
      });
    },
  ],

  async requestHandler({ page, request }) {
    console.log(`Visiting: ${request.url}`);

    try {
      await page.waitForSelector('.srp-jobtuple-wrapper', { timeout: 15000 });
    } catch {
      console.log(`  ⚠️  No job cards found on: ${request.url}`);
      return;
    }

    await page.waitForTimeout(2000);

    // Extract raw job data from the page
    const rawJobs = await page.evaluate((prefs) => {
      const cards = document.querySelectorAll('.srp-jobtuple-wrapper');

      return Array.from(cards)
        .slice(0, prefs.maxJobsPerSearch)
        .map((card) => {
          const jobUrl = card.querySelector('a.title')?.href || '';

          return {
            job_url:     jobUrl,
            title:       card.querySelector('a.title')?.innerText?.trim()    || '',
            company:     card.querySelector('.comp-name')?.innerText?.trim() || '',
            location:    card.querySelector('.locWdth')?.innerText?.trim()   || '',
            experience:  card.querySelector('.expwdth')?.innerText?.trim()   || '',
            salary:      card.querySelector('.sal-wrap .ni-job-tuple-icon')
                           ?.innerText?.trim() || 'Not disclosed',
            posted_date: card.querySelector('.job-post-day')?.innerText?.trim() || '',
          };
        })
        .filter((j) => j.job_url); // must have a URL
    }, preferences);

    // Apply robust job_id extraction (done in Node.js, not browser context)
    // so extractJobId() is available and query params are reliably stripped.
    const jobsWithId = rawJobs.map((j) => ({
      job_id: extractJobId(j.job_url),
      ...j,
    })).filter((j) => j.job_id); // drop any that produced an empty id

    // Apply title filter
    const beforeCount   = jobsWithId.length;
    const relevantJobs  = jobsWithId.filter((j) => isTitleRelevant(j.title));
    const dropped       = beforeCount - relevantJobs.length;

    console.log(
      `  Found ${beforeCount} jobs → kept ${relevantJobs.length}, ` +
      `dropped ${dropped} irrelevant titles`
    );

    allJobs.push(...relevantJobs);
  },

  failedRequestHandler({ request }) {
    console.log(`  ❌ FAILED: ${request.url}`);
  },

  maxRequestRetries: 2,
});

(async () => {
  await crawler.run(urls);

  // Deduplicate by job_id — same job appearing across multiple
  // search URLs (e.g. power-bi + bangalore AND data-analyst + bangalore)
  // will only be kept once.
  const uniqueJobs = Array.from(
    new Map(allJobs.map((j) => [j.job_id, j])).values()
  );

  fs.writeFileSync('jobs.json', JSON.stringify(uniqueJobs, null, 2));

  console.log('\n══════════════════════════════════════');
  console.log(`URLs crawled  : ${urls.length}`);
  console.log(`Total scraped : ${allJobs.length}`);
  console.log(`Unique saved  : ${uniqueJobs.length}`);
  console.log(`Duplicates    : ${allJobs.length - uniqueJobs.length}`);
  console.log('Output        : jobs.json');
  console.log('══════════════════════════════════════\n');
})();
