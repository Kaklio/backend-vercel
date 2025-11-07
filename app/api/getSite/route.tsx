import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import TurndownService from "turndown";

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

export async function POST(req : Request) {
  try {
    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "Missing 'url' in request body." }, { status: 400 });
    }

    // Fetch the HTML
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const html = await response.text();

    // Extract main readable portion
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
      .replace(/<footer[\s\S]*?>[\s\S]*?<\/footer>/gi, "");

    const markdown = turndownService.turndown(clean);

console.log("Extracted Markdown:", markdown);

    return NextResponse.json({ content: markdown });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
