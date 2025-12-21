import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");

    if (!query) {
      return NextResponse.json(
        { error: "Missing required `query` parameter" },
        { status: 400 }
      );
    }

    const email = process.env.UNPAYWALL_EMAIL;
    if (!email) {
      return NextResponse.json(
        {
          error:
            "Server misconfiguration: UNPAYWALL_EMAIL environment variable is not set",
        },
        { status: 500 }
      );
    }

    // Build the Unpaywall API search URL
    const apiUrl =
      `https://api.unpaywall.org/v2/search?query=${encodeURIComponent(
        query
      )}&email=${encodeURIComponent(email)}`;

    // Call Unpaywall API
    const res = await fetch(apiUrl);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Error fetching from Unpaywall API" },
        { status: res.status }
      );
    }

    const { results } = await res.json();

    const filtered = (results ?? [])
      .map((item: any) => {
        const r = item.response ?? {};

        return {
          year: r.year,
          title: r.title,
          journal_name: r.journal_name,
          doi_url: r.doi_url,
          url_for_pdf: r.best_oa_location?.url_for_pdf ?? null,
        };
      })
      // optional: only keep entries that have at least a title
      .filter((e: any) => e.title);

    return NextResponse.json({ results: filtered });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
