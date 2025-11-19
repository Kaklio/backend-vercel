// app/api/getSite/route.tsx
import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import TurndownService from "turndown";
import puppeteerCore from 'puppeteer-core';
import chromium from "@sparticuz/chromium-min";
import puppeteer from 'puppeteer';

// Helper to extract main readable text
function extractMainContent(html: string) {
  const $ = cheerio.load(html);

  // Try to grab meaningful parts of the page first
  let main =
    $("main").html() ||
    $("article").html() ||
    $("div[id*='content']").html() ||
    $("div[class*='content']").html() ||
    $("body").html();

  // If nothing matched, just return entire body
  if (!main) main = $("body").html();

  return main;
}

export async function POST(req: Request) {
  let browser;
  
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "Missing 'url' in request body." }, { status: 400 });
    }

    console.log("Fetching URL:", url);

    // Launch Puppeteer with optimized settings
    // browser = await puppeteer.launch({
    //   headless: true,
    //   args: [
    //     '--no-sandbox',
    //     '--disable-setuid-sandbox',
    //     '--disable-dev-shm-usage',
    //     '--disable-accelerated-2d-canvas',
    //     '--no-first-run',
    //     '--no-zygote',
    //     '--disable-gpu'
    //   ]
    // });

if(process.env.ENVIRONMENT == "dev")
{
  console.log("[Dev ENVIRONMENT]")
  try {
    // Use Puppeteer to render JavaScript
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: "Failed to fetch content" }, { status: 500 });
  }
  
  }
  else
{
  console.log("[Production ENVIRONMENT]")
  const executablePath = await chromium.executablePath(process.env.CHROMIUM_REMOTE_EXEC_PATH);
   browser = await puppeteerCore.launch({ args: chromium.args, executablePath, headless: true });
}

 
    const page = await browser.newPage();
    
    // Set user agent using the correct method
    // await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Set viewport to desktop size
    await page.setViewport({ width: 1280, height: 720 });

    // Navigate to the page and wait for network to be idle
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });

    // Wait for potential content to load - try multiple common content selectors
    const contentSelectors = [
      'article',
      'main',
      '[class*="content"]',
      '[class*="post"]',
      '[class*="article"]',
      '.content',
      '#content',
      '.post-content',
      '.article-content'
    ];

    // Try to wait for any content element to appear
    try {
      await page.waitForFunction(
        (selectors: string[]) => {
          return selectors.some(selector => {
            const element = document.querySelector(selector);
            return element && element.textContent && element.textContent.trim().length > 0;
          });
        },
        { timeout: 10000 },
        contentSelectors
      );
    } catch (waitError) {
      console.log("No specific content selectors found, continuing with full page...");
      // Continue anyway - some sites might not use standard selectors
    }

    // Additional wait to ensure dynamic content loads - use setTimeout instead of waitForTimeout
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get the fully rendered HTML
    const html = await page.content();

    // Extract main readable portion using cheerio
    const mainContent = extractMainContent(html);

    // Convert HTML → Markdown
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });

    // Optional: remove scripts, styles, navbars, etc.
    if (!mainContent) {
      return NextResponse.json({ error: "Could not extract main content." }, { status: 500 });
    }

    const clean = mainContent
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?>[\s\S]*?<\/header>/gi, "")
      .replace(/<aside[\s\S]*?>[\s\S]*?<\/aside>/gi, "");

    const markdown = turndownService.turndown(clean);

    console.log("Successfully extracted content from:", url);
    console.log("Markdown length:", markdown.length);
    console.log("Extracted Markdown:", markdown);

    return new NextResponse(markdown, {
      headers: { 
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(markdown).toString()
      },
    });

  } catch (err: any) {
    console.error("Error in getSite API:", err);
    return NextResponse.json({ 
      error: `Failed to fetch and process URL: ${err.message}` 
    }, { status: 500 });
  } finally {
    // Always close the browser to prevent memory leaks
    if (browser) {
      await browser.close();
    }
  }
}