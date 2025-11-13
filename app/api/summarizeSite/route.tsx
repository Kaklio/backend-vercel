import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "Missing 'url' in request body." }, { status: 400 });
    }

    // Step 1: Get markdown from the getSite API
    const markdownResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/getSite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!markdownResponse.ok) {
      throw new Error(`Failed to get markdown: ${markdownResponse.status}`);
    }

    const markdown = await markdownResponse.text();

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

Webpage content markdown format:
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