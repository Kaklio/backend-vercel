import { NextResponse } from "next/server";
import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteer from "puppeteer-extra";
import TurndownService from "turndown";
import * as cheerio from "cheerio";

puppeteer.use(StealthPlugin());

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 1. Define the replacement for waitForTimeout
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const runtime = "nodejs";

export async function POST(req: Request) {
  let browser: any;
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "Missing 'url'." }, { status: 400 });

    const isDev = process.env.ENVIRONMENT == "dev";

    if (isDev) {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    } else {
      const chromiumRemote = process.env.CHROMIUM_REMOTE_EXEC_PATH 
        || "https://github.com/Sparticuz/chromium/releases/download/v121.0.0/chromium-v121.0.0-pack.x64.tar";

      const executablePath = await chromium.executablePath(chromiumRemote);
      
      browser = await puppeteerCore.launch({
        args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath,
        headless: true,
      });
    }

    const page = await browser.newPage();
    await page.setUserAgent(DEFAULT_USER_AGENT);
    await page.setViewport({ width: 1280, height: 800 });
    
    // 2. DOI handling: Allow redirects to settle
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    
    // 3. Check if we landed on a PDF file
    const contentType = response.headers()['content-type'];
    if (contentType && contentType.includes('application/pdf')) {
        return NextResponse.json({ error: "URL is a direct PDF. Use a PDF parser instead of HTML scraper." }, { status: 422 });
    }

    // Cloudflare Check
    const MAX_WAIT_MS = 25000;
    const start = Date.now();
    while (Date.now() - start < MAX_WAIT_MS) {
      const html = await page.content();
      if (!/Just a moment|Verification successful|Checking your browser/.test(html)) {
        break;
      }
      // 4. Use the new delay function
      await delay(1500);
    }

    const finalHtml = await page.content();
    
    // ... (Rest of your scraping logic) ...

    const $ = cheerio.load(finalHtml);
    // Note: For academic sites, 'article' often fails. Fallback to body is safer but messier.
    const articleEl = $('article').first();
    const contentHtml = articleEl.length ? articleEl.html() : $('body').html();

    const turndownService = new TurndownService();
    const markdown = turndownService.turndown(contentHtml || '');

    return new NextResponse(markdown, {
      headers: { 'Content-Type': 'text/plain' },
    })

  } catch (err: any) {
    console.error("Scrape error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}