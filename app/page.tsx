"use client";

import { useState } from "react";
import ReactMarkdown from 'react-markdown';

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

 const handleClick = async () => {
  if (!url.trim()) return;

  setLoading(true);
  setResult(null);

  try { 
    const res = await fetch(`/api/summarizeSite?url=${encodeURIComponent(url)}`, {
      method: "GET",
    });
   
    //  const res = await fetch(`/api/getSite_D`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ url }),
    // });

    const data = await res.text();
    setResult(data || "No response");
    downloadMarkdown();
  } catch (err) {
    setResult("Error fetching response");
  } finally {
    setLoading(false);
  }
};

  const downloadMarkdown = () => {
    if (!result) 
      {
        console.log("NOT downloaded")
        return;}

    // Create a Blob with the markdown content
    const blob = new Blob([result], { type: 'text/markdown' });
    
    // Create a temporary URL for the Blob
    const url = URL.createObjectURL(blob);
    
    // Create a temporary anchor element to trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'result.md';
    
        console.log("DOWNLOADED")
console.log("Raw result:", result);


    // Trigger the download
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-center py-32 px-16 bg-white dark:bg-black sm:items-start">
        <h1 className="text-2xl mb-6 text-gray-900 dark:text-gray-100 font-semibold">
          Enter website URL to summarize:
        </h1>

        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter website URL..."
          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-4 py-2 mb-4 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
        />

        <button
          onClick={handleClick}
          disabled={loading}
          className="rounded-xl bg-purple-600 text-white px-6 py-3 hover:bg-purple-700 transition disabled:opacity-60"
        >
          {loading ? "Summarizing..." : "Summarize Website"}
        </button>

        <button
          onClick={downloadMarkdown}
          disabled={loading}
          className="rounded-xl bg-purple-600 text-white px-6 py-3 hover:bg-purple-700 transition disabled:opacity-60"
        >
          {loading ? "Download" : "Download"}
        </button>

        <div className="mt-6 text-lg text-gray-800 dark:text-gray-200">
          {result && (
            <p>
            <ReactMarkdown>
              {result}
            </ReactMarkdown>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}