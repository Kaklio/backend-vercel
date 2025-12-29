// app/api/extractPdf/route.ts
import { NextResponse } from "next/server";
import pdf from "@cedrugs/pdf-parse";

// Point this to your local Docker container
// If running Next.js in Docker too, use "http://pdf-scraper:3000"
const SCRAPER_URL = process.env.DOCKER_SCRAPER_URL || 'http://localhost:3005/scrape'; 

export async function POST(req: Request) {

    console.log("extractPdf_docker CALLED")
  try {
    const { url } = await req.json();

    // 1. Request the PDF from our microservice
    const scraperRes = await fetch(SCRAPER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
    });

    if (!scraperRes.ok) {
        const errText = await scraperRes.text();
        throw new Error(`Scraper failed: ${scraperRes.status} - ${errText}`);
    }

    // 2. Get the binary data
    const pdfBuffer = Buffer.from(await scraperRes.arrayBuffer());

    // DEBUG: Check if it's actually a PDF
    const header = pdfBuffer.toString('utf8', 0, 50);
    console.log("BUFFER HEADER:", header); // <--- Add this line

    // 3. Parse text
    const result = await pdf(pdfBuffer);

    return new NextResponse(result.text.trim(), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}