// jobdetails.js
// Uses real Chrome to bypass Naukri bot detection.
// Saves progress after every job — safe to restart if it crashes.
// ✅ Fresh session = old filtered_jobs.json is wiped before starting.

const { chromium } = require('playwright');
const fs = require('fs');

// ─── CONFIG ──────────────────────────────────────────────────
const MIN_DESCRIPTION_LENGTH = 100;
const DELAY_BETWEEN_JOBS_MS  = 4000;
const PROGRESS_FILE          = 'progress.json';
const OUTPUT_FILE            = 'filtered_jobs.json';

const DESC_SELECTORS = [
  '[class*="job-desc-container"]',
  '.nI-gNb-description',
  '[class*="jobDescription"]',
  '[class*="description-container"]',
  '[class*="dang-inner-html"]',
  '.jd-desc',
  'section.description',
];

const SALARY_SELECTORS = [
  '[class*="salary"]',
  '.compensation',
  '.other-details span',
];

const EXPIRED_TITLE_SIGNALS = [
  'jobs in india',
  'job vacancies',
  'page not found',
  'jobs in bangalore',
  'jobs in hyderabad',
  'jobs in remote',
  'naukri.com - jobs',
];
// ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function humanMove(page) {
  await page.mouse.move(300 + Math.random() * 400, 200 + Math.random() * 300);
  await sleep(200 + Math.random() * 400);
}

function isExpiredOrRedirected(pageTitle, currentUrl, originalUrl) {
  const titleLower    = pageTitle.toLowerCase();
  const titleExpired  = EXPIRED_TITLE_SIGNALS.some((s) => titleLower.includes(s));
  const urlRedirected =
    !currentUrl.includes('job-listings') &&
    originalUrl.includes('job-listings');
  return titleExpired || urlRedirected;
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      const p = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      return p.lastCompletedIndex ?? -1;
    } catch {
      return -1;
    }
  }
  return -1;
}

function saveProgress(index) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastCompletedIndex: index }));
}

function saveOutput(enrichedJobs) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(enrichedJobs, null, 2));
}

// ─────────────────────────────────────────────────────────────

(async () => {
  if (!fs.existsSync('jobs.json')) {
    console.error('jobs.json not found. Run main.js first.');
    process.exit(1);
  }

  const jobs = JSON.parse(fs.readFileSync('jobs.json', 'utf8'));

  // ── Session logic ─────────────────────────────────────────
  const lastCompletedIndex = loadProgress();
  const isFreshSession     = lastCompletedIndex === -1;

  let enrichedJobs = [];
  let startFrom    = 0;

  if (isFreshSession) {
    // ✅ FRESH RUN — delete any leftover output from previous sessions
    if (fs.existsSync(OUTPUT_FILE)) {
      fs.unlinkSync(OUTPUT_FILE);
      console.log('\n🗑️  Cleared old filtered_jobs.json — starting fresh session.');
    }
    console.log(`\nLoaded ${jobs.length} jobs from jobs.json`);
    console.log('Starting fresh...\n');
  } else {
    // ✅ RESUME — load what we already saved this session and continue
    startFrom = lastCompletedIndex + 1;
    if (fs.existsSync(OUTPUT_FILE)) {
      try {
        enrichedJobs = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      } catch {
        enrichedJobs = [];
      }
    }
    console.log(`\nResuming from job ${startFrom + 1}/${jobs.length}`);
    console.log(`Already saved this session: ${enrichedJobs.length} jobs\n`);
  }
  // ─────────────────────────────────────────────────────────

  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--start-maximized',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Safari/537.36',
    viewport: null,
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,' +
        'image/webp,*/*;q=0.8',
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();

  await page.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'media'].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  // Warm up only on fresh session start
  if (isFreshSession) {
    console.log('Warming up — visiting Naukri homepage...');
    await page.goto('https://www.naukri.com', {
      waitUntil: 'load',
      timeout: 30000,
    });
    await humanMove(page);
    await sleep(3000);
    console.log('Warmup done. Starting job scraping...\n');
  }

  let expiredCount = 0;
  let failCount    = 0;

  for (let index = startFrom; index < jobs.length; index++) {
    const job = jobs[index];
    console.log(`[${index + 1}/${jobs.length}] ${job.title} @ ${job.company}`);

    if (!job.job_url) {
      console.log('  Skipping — no URL\n');
      saveProgress(index);
      continue;
    }

    try {
      await page.goto(job.job_url, {
        waitUntil: 'load',
        timeout: 60000,
      });

      await page.waitForTimeout(3000);
      await page.evaluate(() => window.scrollBy(0, 400));
      await sleep(500);
      await humanMove(page);

      const pageTitle  = await page.title();
      const currentUrl = page.url();

      if (isExpiredOrRedirected(pageTitle, currentUrl, job.job_url)) {
        console.log(`  EXPIRED — "${pageTitle}"\n`);
        expiredCount++;
        saveProgress(index);
        await sleep(DELAY_BETWEEN_JOBS_MS);
        continue;
      }

      let descriptionText = '';

      for (const selector of DESC_SELECTORS) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          const text = await page.$eval(
            selector,
            (el) => el.innerText?.trim() || ''
          );
          if (text.length >= MIN_DESCRIPTION_LENGTH) {
            descriptionText = text;
            console.log(`  Selector: ${selector}`);
            break;
          }
        } catch {
          // try next
        }
      }

      // Last resort — scan body for description headers
      if (descriptionText.length < MIN_DESCRIPTION_LENGTH) {
        const bodyText = await page.evaluate(
          () => document.body?.innerText?.trim() || ''
        );
        const markers = [
          'job description',
          'about the role',
          'responsibilities',
          'what you will do',
          'role description',
        ];
        const lower = bodyText.toLowerCase();
        for (const marker of markers) {
          const idx = lower.indexOf(marker);
          if (idx !== -1) {
            descriptionText = bodyText.slice(idx, idx + 3000);
            console.log(`  Extracted via body marker: "${marker}"`);
            break;
          }
        }
      }

      if (descriptionText.length < MIN_DESCRIPTION_LENGTH) {
        console.log(`  SKIPPED — no description found. Page: "${pageTitle}"\n`);
        failCount++;
        saveProgress(index);
        await sleep(DELAY_BETWEEN_JOBS_MS);
        continue;
      }

      const scraped = await page.evaluate(({ salarySelectors }) => {
        let salary = '';
        for (const sel of salarySelectors) {
          const el = document.querySelector(sel);
          if (el?.innerText?.trim()) {
            salary = el.innerText.trim();
            break;
          }
        }

        const skillTags = Array.from(
          document.querySelectorAll(
            '.key-skill, [class*="chip"], [class*="tag"], [class*="skill"]'
          )
        )
          .map((el) => el.innerText?.trim())
          .filter((t) => t && t.length < 40)
          .filter((t, i, arr) => arr.indexOf(t) === i);

        const workModeEl =
          document.querySelector('[class*="work-mode"]') ||
          document.querySelector('[class*="workMode"]');

        const aboutEl =
          document.querySelector('[class*="about-company"]') ||
          document.querySelector('[class*="aboutCompany"]');

        return {
          salary,
          key_skills:    skillTags,
          work_mode:     workModeEl?.innerText?.trim() || '',
          about_company: aboutEl?.innerText?.trim()    || '',
        };
      }, { salarySelectors: SALARY_SELECTORS });

      enrichedJobs.push({
        job_id:        job.job_id,
        job_url:       job.job_url,
        title:         job.title,
        company:       job.company,
        location:      job.location,
        experience:    job.experience,
        posted_date:   job.posted_date,
        salary:        scraped.salary        || job.salary,
        work_mode:     scraped.work_mode     || '',
        key_skills:    scraped.key_skills    || [],
        about_company: scraped.about_company || '',
        description:   descriptionText,
      });

      // Save after every single job
      saveOutput(enrichedJobs);
      saveProgress(index);

      console.log(
        `  Saved — ${descriptionText.length} chars | ` +
        `${scraped.key_skills.length} skills | ` +
        `salary: ${scraped.salary || 'not found'}\n`
      );

    } catch (error) {
      console.log(`  ERROR: ${error.message}\n`);
      failCount++;
      saveProgress(index);
    }

    await sleep(DELAY_BETWEEN_JOBS_MS);
  }

  await browser.close();

  // Clean up progress file on successful full completion
  if (fs.existsSync(PROGRESS_FILE)) {
    fs.unlinkSync(PROGRESS_FILE);
    console.log('Progress file cleared.\n');
  }

  console.log('══════════════════════════════════');
  console.log(`Jobs processed : ${jobs.length - startFrom}`);
  console.log(`Jobs saved     : ${enrichedJobs.length}`);
  console.log(`Expired/gone   : ${expiredCount}`);
  console.log(`Failed/skipped : ${failCount}`);
  console.log('Output         : filtered_jobs.json');
  console.log('══════════════════════════════════\n');
})();
