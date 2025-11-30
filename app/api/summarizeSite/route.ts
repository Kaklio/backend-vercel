import { NextResponse } from "next/server";

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
  const headers = getCorsHeaders();
  // If empty origin header for non-allowed, you can return 403; here we return 204 with headers.
  return new NextResponse(null, { status: 204, headers });
}


export async function GET(request: Request) {

  const headers = getCorsHeaders();

  console.log("Summarize Site CALLED")
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json(
        { error: "Missing 'url' in query parameters." },
        { status: 400 }
      );
    }
    // Step 1: Get markdown from the getSite API
    const markdownResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/getSite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });


    let markdown;


    if (!markdownResponse.ok) {
      console.log("markdownResponse.status:", markdownResponse.status)
      if(markdownResponse.status == 403) {
          console.log("GOT 403 ERROR!!")
          console.log("Site has bot protection :(")
          markdown = " "; // Trigger getSite_D call
      }
      else {
          throw new Error(`Failed to get markdown: ${markdownResponse.status}`);
      }
    }
    else {
      markdown = await markdownResponse.text();
    }
    
    // MAGIC Number is 5000 if length is lesser than call the dynamic route
    if(markdown && markdown.length < 5000)
    {
        console.log("Markdown Length: ", markdown.length, " < 5000")
        console.log("Calling getSite_D...")
        const markdownResponse2 = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/getSite_D`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!markdownResponse2.ok) {
        throw new Error(`Failed to get markdown: ${markdownResponse2.status}`);
      }

      markdown = await markdownResponse2.text();

    }

    // Step 2: Prepare the prompt for the LLM
    const prompt = `Please analyze and summarize the following webpage content. Your goal is to create a well-structured, context-aware summary that retains all important information, citations and links, while organizing it in a format that would be useful for another LLM to process later.

IMPORTANT INSTRUCTIONS:
- Retain ALL factual information, data points, and key details from the original content
- Preserve ALL links in their original format - do not modify or remove URLs
- Remove all images, ads, navigation elements, and other non-content elements
- Organize the information in a logical, hierarchical structure
- Use clear headings and sections to group related information
- Maintain the original meaning and context of all information
- Focus on creating a comprehensive yet organized format that another LLM can easily parse


Webpage content in markdown format:
[IMPORTANT CAVEAT: IF the following content is missing or lacks any substantial information then respond with: "Unable To Read Site"]
${markdown}

Provide the summarized and organized content in proper markdown as per above instrucions:`;



    // Step 3: Send to the ask API for processing
    const llmResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: prompt }),
    });

    if (!llmResponse.ok) {
      throw new Error(`Failed to get LLM response: ${llmResponse.status}`);
    }

    const llmData = await llmResponse.json();
    const summarizedContent = llmData.content || "No content received from LLM";

    return new NextResponse(summarizedContent, {
      headers: { 'Content-Type': 'text/plain' },
    });

  } catch (err: any) {
    console.error("Summarize site error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}