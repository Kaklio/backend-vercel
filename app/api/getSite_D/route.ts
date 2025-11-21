// route.ts
import { NextResponse } from "next/server";
import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteer from "puppeteer-extra"; // for local dev only; optional
import TurndownService from "turndown";
import * as cheerio from "cheerio";

  puppeteer.use(StealthPlugin())

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const runtime = "nodejs";

export async function POST(req: Request) {
  console.log("getite_D CALLED")
  let browser: any;
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: "Missing 'url'." }, { status: 400 });

    const isDev = process.env.ENVIRONMENT == "dev";

    console.log("isDev:", isDev)

    if (isDev) {
      // local dev - full puppeteer works fine
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      // wrap the puppeteer browser for stealth plugin usage
      // Note: if using puppeteer (not puppeteer-core), use puppeteerExtra.launch with the puppeteer executable
      // If puppeteerExtra doesn't accept puppeteer here, you can use page-level stealth (works with puppeteer-core too)
    } else {
      // production - use puppeteer-core + sparticuz chromium
      const chromiumRemote = process.env.CHROMIUM_REMOTE_EXEC_PATH
        || "https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.x64.tar";

      const executablePath = await chromium.executablePath(chromiumRemote);

      // Launch the browser with attacks mitigation flags removed and with common flags added
      browser = await puppeteerCore.launch({
        args: [
          ...chromium.args,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--single-process',
          '--disable-accelerated-2d-canvas',
          // Important: do NOT include automation flags you don't want to reveal
        ],
        executablePath,
        headless: true,
      });
    }

    // const context = await browser.createIncognitoBrowserContext();
    const page = await browser.newPage();

    // common anti-detection headers
    await page.setUserAgent(DEFAULT_USER_AGENT);
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9',
      'referer': 'https://www.google.com/',
    });

    // Optionally set a site-specific cookie or prior visit to homepage to get cookies first
    // Example: visit homepage first to get cookies
    try {
      const homepage = (new URL(url)).origin;
      await page.goto(homepage, { waitUntil: 'networkidle2', timeout: 30000 });
      // small delay so challenge can be solved and cookies set
      await page.waitForTimeout(2000);
    } catch (err) {
      // ignore homepage fail — we'll attempt article directly
    }

    // Now navigate to article
    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // If Cloudflare shows a challenge, detect it and wait longer
    // We'll wait until page does NOT contain "Just a moment" or "Verification successful" text
    const MAX_WAIT_MS = 25000;
    const start = Date.now();
    while (Date.now() - start < MAX_WAIT_MS) {
      const html = await page.content();
      if (!/Just a moment|Verification successful|Checking your browser/.test(html)) {
        // challenge likely passed
        break;
      }
      // allow some time for JS challenge to finish
      await page.waitForTimeout(1500);
    }

    // If still showing challenge after waiting, try a longer wait or return blocked
    const finalHtml = await page.content();

    if (/Just a moment|Verification successful|Checking your browser/.test(finalHtml)) {
      // still blocked — likely Cloudflare persistent challenge or CAPTCHA
      console.warn("Cloudflare challenge still present for", url);
      return NextResponse.json({ error: "Blocked by anti-bot (Cloudflare) challenge" }, { status: 403 });
    }

    // Extract article content
    const html = finalHtml;
    const $ = cheerio.load(html);

    // Most sites have article, main, or .post-content — customize this for dawn.com if needed
    const articleEl = $('article').first();
    const contentHtml = articleEl.length ? articleEl.html() : $('main').first().html() || $('body').html();

    const turndownService = new TurndownService();
    const markdown = turndownService.turndown(contentHtml || '');

    return new NextResponse(markdown, {
  headers: { 'Content-Type': 'text/plain' },
  })
  } catch (err: any) {
    console.error("Scrape error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
  }
}
