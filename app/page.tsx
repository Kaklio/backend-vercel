"use client";

import { useState } from "react";

export default function Home() {
  const [query, setQuery] = useState("");         // <— user input
  const [url, seturl] = useState("");         // <— user input
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (!url.trim()) return; // simple validation

    setLoading(true);
    setResult(null);

    try {
      // const res = await fetch("/api/ask", {
      const res = await fetch("/api/getSite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),           // <— send query
      });

      const data = await res.json();
      setResult(data.content  || "No response");
    } catch (err) {
      setResult("Error fetching response");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center py-32 px-16 bg-white dark:bg-black sm:items-start">
        <h1 className="text-2xl mb-6 text-gray-900 dark:text-gray-100 font-semibold">
          Ask something:
        </h1>

        <input
          type="text"
          value={url}
          onChange={(e) => seturl(e.target.value)}
          placeholder="Type your question..."
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 mb-4 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
        />

        <button
          onClick={handleClick}
          disabled={loading}
          className="rounded-xl bg-purple-600 text-white px-6 py-3 hover:bg-purple-700 transition disabled:opacity-60"
        >
          {loading ? "Running..." : "Send to /api/ask"}
        </button>

        {result && (
          <p className="mt-6 text-lg text-gray-800 dark:text-gray-200">
            {result}
          </p>
        )}
      </main>
    </div>
  );
}
