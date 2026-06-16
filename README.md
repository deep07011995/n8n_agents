# Career Copilot

AI-powered job hunting workflow built with n8n, Playwright, NeonDB, and LLMs.

## Overview

Career Copilot automates the entire job discovery process:

1. Search jobs automatically
2. Scrape job details
3. Score jobs using AI by comparing with resume
4. Store results in NeonDB
5. Send relevant jobs alerts via mail

## Tech Stack

- n8n
- Playwright
- NeonDB
- Gemini/OpenAI
- JavaScript
- VS Code

## Architecture

Job Search
↓
Playwright Scraping
↓
Resume Information
↓
AI Relevance Scoring based on Resume
↓
NeonDB Storage
↓
Email Alert for everyday's job posting

## Execution Flow

### Step 1: Discover Jobs

Run the job search script to collect relevant job listings.

```bash
node main.js
```

### Step 2: Extract Job Details

Run the job details scraper to enrich job records with complete information.

```bash
node jobdetails.js
```

### Step 3: Start Local API Server

Expose the filtered job data through a local endpoint.

```bash
node server.js
```

Server URL:

```text
http://localhost:3456
```

### Step 4: Execute n8n Workflow

1. Import the workflow from:

   ```
   workflows/job-agent-workflow.json
   ```
2. Configure required credentials.
3. Execute the workflow manually or through a schedule trigger.

### End-to-End Flow

```text
Job Search
↓
main.js
↓
jobdetails.js
↓
filtered_jobs.json
↓
server.js
↓
n8n Workflow
↓
AI Relevance Scoring
↓
NeonDB Storage
↓
Email Notifications
```

## Repository Structure

```text
workflows/
sql/
scripts/
docs/
```

## Future Improvements

- LinkedIn integration
- Dashboard analytics
