import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("q");

    if (!rawQuery) {
      return NextResponse.json(
        { error: "Missing required `query` parameter" },
        { status: 400 }
      );
    }

    // Append !gos to enforce Google Scholar results
    const finalQuery = `${rawQuery} !gos`;

    const searxUrl =
      `https://searxng-production-eef8.up.railway.app/` +
      `?q=${encodeURIComponent(finalQuery)}&format=json`;

    const response = await fetch(searxUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: "Error fetching from SearXNG" },
        { status: response.status }
      );
    }

    const data = await response.json();

    // // Filter results to only include specified fields
    // const filteredResults = (data.results ?? []).map((result: any) => ({
    //   title: result.title || "",
    //   url: result.url || "",
    //   pdf_url: result.pdf_url || "",
    //   html_url: result.html_url || "",
    // }));

const filteredResults = (data.results ?? []).map((result: any) => {
  const filtered: any = {};
  
  if (result.title) filtered.title = result.title;
  if (result.url) filtered.url = result.url;
  if (result.pdf_url) filtered.pdf_url = result.pdf_url;
  
  return filtered;
});

    // Match original output structure
    const filteredData = {
      query: data.query,
      number_of_results: data.number_of_results,
      results: filteredResults,
    };

    return NextResponse.json(filteredData);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
