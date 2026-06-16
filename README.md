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
