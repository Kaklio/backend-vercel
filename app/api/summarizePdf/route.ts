import { NextResponse } from "next/server";
import { prepareScientificPdfForLLM } from "@/lib/pdfPrune";

function getCorsHeaders(origin?: string) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

export async function GET(request: Request) {
  const headers = getCorsHeaders();

  console.log("Summarize PDF CALLED");

  try {
    const { searchParams } = new URL(request.url);
    const pdfUrl = searchParams.get("url");

    if (!pdfUrl) {
      return NextResponse.json(
        { error: "Missing 'url' in query parameters." },
        { status: 400 }
      );
    }

    const baseUrl =
      process.env.NEXTAUTH_URL || "http://localhost:3000";

    /**
     * Step 1: Extract text from PDF
     */
    const extractResponse = await fetch(
      `${baseUrl}/api/extractPdf`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: pdfUrl }),
      }
    );

    if (!extractResponse.ok) {
      throw new Error(
        `Failed to extract PDF text: ${extractResponse.status}`
      );
    }

    const extractData = await extractResponse.text();

    const rawPdfText = extractData || "";
const { text: pdfText, sections } = prepareScientificPdfForLLM(rawPdfText, {
  maxChars: 12000,
  minSectionLength: 150,
  preferIntro: true,
  keepOrder: true,
});

// Optional: log which sections were extracted
console.log("Extracted sections:", Object.keys(sections));

if (!pdfText || pdfText.length < 200) {
  return new NextResponse("Unable To Read PDF", {
    headers: {
      ...headers,
      "Content-Type": "text/plain",
    },
  });
}

    
    if (!pdfText || pdfText.trim().length < 100) {
      return new NextResponse("Unable To Read PDF", {
        headers: {
          ...headers,
          "Content-Type": "text/plain",
        },
      });
    }

    /**
     * Step 2: Prepare LLM prompt
     */
    const prompt = `
Please analyze and summarize the following PDF content.

GOALS:
- Extract and preserve all key factual information
- Identify the main topic, objectives, and conclusions
- Retain important data and figures if present
- Organize the summary into clear sections
- Remove boilerplate, headers, footers, and repeated page artifacts if present
- Produce output suitable for downstream LLM processing

IMPORTANT:
- If the content is unreadable, fragmented, or meaningless, respond with:
  "Unable To Read PDF"

PDF content:
${pdfText}

Return the summarized and structured content in proper markdown:
`;

    /**
     * Step 3: Call LLM
     */
    const llmResponse = await fetch(
      `${baseUrl}/api/ask`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: prompt }),
      }
    );

    if (!llmResponse.ok) {
      throw new Error(
        `Failed to get LLM response: ${llmResponse.status}`
      );
    }

    const llmData = await llmResponse.json();
    const summarizedContent =
      llmData.content || "No content received from LLM";

    return new NextResponse(summarizedContent, {
      headers: {
        ...headers,
        "Content-Type": "text/plain",
      },
    });
  } catch (err: any) {
    console.error("Summarize PDF error:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
