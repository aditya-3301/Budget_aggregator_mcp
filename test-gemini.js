import OpenAI from "openai";
import * as dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: process.env.HUGGING_API,
});

async function testKey() {
  try {
    const completion = await client.chat.completions.create({
      model: "deepseek-ai/DeepSeek-V3.2:novita",
      messages: [
        {
          "role": "user",
          "content": "What is the capital of France?"
        }
      ],
    });
    console.log("API Key works! Response:", completion.choices[0].message.content);
  } catch (error) {
    console.error("API Key error:", error.message);
  }
}

testKey();