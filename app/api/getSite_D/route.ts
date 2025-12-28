// app/api/getSite/route.ts
import { NextResponse } from "next/server";
import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteer from "puppeteer-extra";
import TurndownService from "turndown";
import * as cheerio from "cheerio";

puppeteer.use(StealthPlugin());

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const runtime = "nodejs";

export async function POST(req: Request) {
  let browser: any;
  // Local variable scope fix
  let url: string;

  try {
    const body = await req.json();
    url = body.url;
    if (!url) return NextResponse.json({ error: "Missing 'url'." }, { status: 400 });

    let finalHtml = "";
    let useDockerFallback = false;

    // --- PHASE 1: Try Fast Headless Browser ---
    try {
        const isDev = process.env.ENVIRONMENT == "dev";
        if (isDev) {
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
        } else {
            const chromiumRemote = process.env.CHROMIUM_REMOTE_EXEC_PATH || "https://github.com/Sparticuz/chromium/releases/download/v121.0.0/chromium-v121.0.0-pack.x64.tar";
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

        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        
        // 403 Check immediately
        if (response?.status() === 403) throw new Error("403 Forbidden");

        // Wait Loop Logic (Your existing robust loop)
        const MAX_WAIT_MS = 25000;
        const start = Date.now();
        
        while (Date.now() - start < MAX_WAIT_MS) {
            try {
                const html = await page.content();
                if (!/Just a moment|Verification successful|Checking your browser|Redirecting/.test(html)) {
                    finalHtml = html;
                    break;
                }
            } catch (error: any) {
                // Ignore specific context errors
            }
            await delay(1500);
        }
        
        if (!finalHtml) finalHtml = await page.content();

        // Check for Cloudflare text in the final result
        if (/Just a moment|Verification successful/.test(finalHtml)) {
             throw new Error("Cloudflare Blocked");
        }

    } catch (err: any) {
        console.log(`Phase 1 Failed: ${err.message}`);
        
        // Trigger fallback if blocked or 403
        if (err.message.includes("403") || err.message.includes("Cloudflare")) {
            useDockerFallback = true;
        } else {
            throw err; // Real error (like invalid URL), rethrow it
        }
    } finally {
        if (browser) await browser.close();
    }


    // --- PHASE 2: Docker Fallback (Real Browser) ---
    if (useDockerFallback) {
        console.log("⚠️ Activating Docker Fallback for HTML...");
        const dockerUrl = process.env.DOCKER_SCRAPER_URL || 'http://localhost:3005/scrape'; 
        
        const dockerRes = await fetch(dockerUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                url: url,
                mode: "html" // <--- The new parameter!
            }),
        });

        if (!dockerRes.ok) throw new Error(`Docker Failed: ${dockerRes.status}`);
        
        finalHtml = await dockerRes.text();
    }


    // --- PHASE 3: Extraction (Turndown) ---
    // At this point, finalHtml should contain the clean page from either Phase 1 or Phase 2
    if (!finalHtml) throw new Error("Failed to retrieve HTML content.");

    const $ = cheerio.load(finalHtml);
    $('script, style, nav, footer, header').remove();

    const articleEl =
      $('article').first().length ? $('article').first() :
        $('[role="main"]').first().length ? $('[role="main"]').first() :
          $('.article-content').first().length ? $('.article-content').first() :
            $('body');

    const contentHtml = articleEl.html();
    const turndownService = new TurndownService();
    const markdown = turndownService.turndown(contentHtml || '');

    return new NextResponse(markdown, {
      headers: { 'Content-Type': 'text/plain' },
    });

  } catch (err: any) {
    console.error("Scrape error:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}