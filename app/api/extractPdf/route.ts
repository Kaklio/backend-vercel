// app/api/extractPdf/route.ts
import { NextResponse } from "next/server";
import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteer from "puppeteer-extra";
import pdf from "@cedrugs/pdf-parse";




puppeteer.use(StealthPlugin());

export const runtime = "nodejs";

const DEFAULT_USER_AGENT =
"Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function POST(req: Request) {
    let pdf_url: any;
    let content_Type: any;

    console.log("extractPdf_Simple CALLED")

    let browser: any;

    try {
        const { url } = await req.json();
        if (!url || !/^https?:\/\//i.test(url)) {
            return NextResponse.json(
                { error: "Valid URL required" },
                { status: 400 }
            );
        }

        const isDev = process.env.ENVIRONMENT === "dev";

        pdf_url = url;

        if (isDev) {
            browser = await puppeteer.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
        } else {
            const chromiumRemote =
                process.env.CHROMIUM_REMOTE_EXEC_PATH ||
                "https://github.com/Sparticuz/chromium/releases/download/v141.0.0/chromium-v141.0.0-pack.x64.tar";

            const executablePath = await chromium.executablePath(chromiumRemote);

            browser = await puppeteerCore.launch({
                args: [
                    ...chromium.args,
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--single-process",
                ],
                executablePath,
                headless: true,
            });
        }

        const page = await browser.newPage();
        await page.setUserAgent(DEFAULT_USER_AGENT);
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setExtraHTTPHeaders({
            "accept-language": "en-US,en;q=0.9",
            referer: "https://www.google.com/",
        });

        // Step 1: visit origin to solve POW / set cookies
        try {
            const origin = new URL(url).origin;
            await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30000 });
            await page.waitForTimeout(2000);
        } catch {
            // ignore
        }

        // FOR PUBLIC PDFs 
        // Step 2: fetch PDF bytes INSIDE browser context
        const pdfArrayBuffer = await page.evaluate(async (pdfUrl: string) => {
            const res = await fetch(pdfUrl, {
                credentials: "include",
            });

            if (!res.ok) {
                throw new Error(`Fetch failed: ${res.status}`);
            }

            const contentType = res.headers.get("content-type") || "";
            
            if (!contentType.includes("application/pdf")) {
                content_Type = contentType;
                console.log("contentType", contentType)
                throw new Error("URL did not return a PDF");
            }

            return Array.from(new Uint8Array(await res.arrayBuffer()));
        }, url);
        const pdfBuffer = Buffer.from(pdfArrayBuffer);
        // FOR PUBLIC PDFs 


        // FOR LOCAL PDF TESTING ONLY (Alternate Step 2)
        // const cookies = await page.cookies();
        // const cookieHeader = cookies
        //   .map((c : any) => `${c.name}=${c.value}`)
        //   .join("; ");

        //   const res = await fetch(url, {
        //   headers: {
        //     "User-Agent": DEFAULT_USER_AGENT,
        //     "Accept": "application/pdf",
        //     "Referer": new URL(url).origin,
        //     "Cookie": cookieHeader,
        //   },
        // });

        // if (!res.ok) {
        //   const err: any = new Error(`Fetch failed: ${res.status}`);
        //   err.status = res.status;
        //   throw err;
        // }

        // const contentType = res.headers.get("content-type") || "";
        // if (!contentType.includes("pdf")) {
        //   throw new Error(`Unexpected content-type: ${contentType}`);
        // }
        // const pdfBuffer = Buffer.from(await res.arrayBuffer());
        // FOR LOCAL PDF TESTING ONLY



        // Step 3: extract text using pdf-parse
        const result = await pdf(pdfBuffer);


        if (!result.text || !result.text.trim()) {
            return NextResponse.json(
                { error: "PDF parsed but no text found (possibly scanned PDF)" },
                { status: 422 }
            );
        }
        
        console.log("PDF extract SUCCESS on Simple ROUTE");
        return new NextResponse(result.text.trim(), {
            headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    } catch (err: any) {
        console.error("PDF extract error:", err);

    // FIX: Check for 403 OR if the "Simple" fetch got blocked/served HTML
    const isForbidden = err.toString().includes("403");
    const isNotPdf = err.toString().includes("URL did not return a PDF");

    if (isForbidden || isNotPdf) {
        console.log(`Enter ${isForbidden ? '403' : 'Non-PDF'} SECTION`);
        console.log("Call Docker Endpoint to BYPASS Anti-BOT");

        try {
            // Make sure to use the Docker service name if running in docker-compose, 
            // e.g., 'http://pdf-scraper:3000/scrape'
            const dockerUrl = process.env.DOCKER_SCRAPER_URL || 'http://localhost:3005/scrape'; 
            
            const res = await fetch(dockerUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: pdf_url }),
            });

            if (!res.ok) {
                 throw new Error(`Docker scraper failed: ${res.status}`);
            }

            // The Docker service returns the raw PDF buffer, NOT text
            const pdfBuffer = Buffer.from(await res.arrayBuffer());

            // We must parse the PDF here in Next.js
            const result = await pdf(pdfBuffer);

            return new NextResponse(result.text.trim(), {
                headers: { "Content-Type": "text/plain; charset=utf-8" },
            });

        } catch (error: any) {
            console.error("Docker Fallback Failed:", error);
            return NextResponse.json(
                { error: error.message || String(error) },
                { status: 500 }
            );
        }
    }

    return NextResponse.json(
        { error: err.message || String(err) },
        { status: 500 }
    );
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch { }
        }
    }
}
