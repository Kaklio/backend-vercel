import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import TurndownService from "turndown";


function getCorsHeaders(origin?: string) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    // 'Access-Control-Allow-Credentials': 'true', // only if you need cookies and origin is explicit (not '*')
  };
}

export async function OPTIONS(request: Request) {
  // const origin = request.headers.get('origin') ?? undefined;
  console.log("getite OPTIONS CALLED")
  const headers = getCorsHeaders();
  // If empty origin header for non-allowed, you can return 403; here we return 204 with headers.
  return new NextResponse(null, { status: 204, headers });
}



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

  const headers = getCorsHeaders();

  let error_code: number = 200;
  try {
  console.log("getite CALLED")

    const { url } = await req.json();
    if (!url) {
      return NextResponse.json({ error: "Missing 'url' in request body." }, { status: 400 });
    }

    // Fetch the HTML
    const response = await fetch(url);
    if (!response.ok) {
      error_code = response.status;
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

console.log("Markdown length:", markdown.length);
// console.log("Extracted Markdown:", markdown);

let length: string = "Markdown Length: " + markdown.length.toString();

    return new NextResponse(markdown, {
    headers: {
    ...getCorsHeaders(),     // add your CORS header set here
    'Content-Type': 'text/plain'
  },
});
  } catch (err : any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: error_code });
  }
}
