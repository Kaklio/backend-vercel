import { NextResponse } from "next/server";
import { InferenceClient } from "@huggingface/inference";

export async function POST(request: Request) {
  try {
    const { query } = await request.json(); // <— read from request body

    if (!query) {
      return NextResponse.json({ content: "No query provided." }, { status: 400 });
    }

    const client = new InferenceClient(process.env.HF_TOKEN);

    const chatCompletion = await client.chatCompletion({
      model: "openai/gpt-oss-120b:fastest",
      messages: [
        {
          role: "user",
          content: query, // <— use user's message
        },
      ],
    });

    const message = chatCompletion.choices[0].message;
    console.log("Response:", message);

    return NextResponse.json(message);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { content: "Error processing your request." },
      { status: 500 }
    );
  }
}
