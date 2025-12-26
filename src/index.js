import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { google } from "googleapis";
import OpenAI from "openai";
import * as dotenv from "dotenv";

// Load keys from .env file
dotenv.config();

/**
 * MANDATORY FOR MCP:
 * We must redirect all standard console.logs to stderr.
 * MCP uses stdout to talk to the AI client. If our libraries print 
 * "Connected!" to stdout, the AI will get a parsing error.
 */
console.log = (...args) => console.error(...args);

// 1. Initialize API Connections
const client = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: process.env.HF_TOKEN,
});

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// Helper to pull the ID out of a Google Sheet URL
const extractId = (url) => url.match(/\/d\/(.*?)(\/|$)/)?.[1] || url;

async function getSheetName(spreadsheetId) {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data.sheets[0].properties.title;
}

async function getMapping(headers) {
  const prompt = `Identify the column indices for category and amount in the headers: ${JSON.stringify(headers)}. Category is the one with budget categories like Equipment, Food, Hosting. Amount is the numerical cost or spending, often called Cost, Amount, or Price. Return ONLY JSON {"category": index, "amount": index}, where indices are 0-based. If not found, use null.`;
  const completion = await client.chat.completions.create({
    model: "deepseek-ai/DeepSeek-V3.2:novita",
    messages: [
      {
        role: "user",
        content: prompt
      }
    ],
  });
  const responseText = completion.choices[0].message.content;
  return JSON.parse(responseText.replace(/```json|```/g, ""));
}

// 2. Create the MCP Server
const server = new Server(
  { name: "budget-aggregator", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// 3. Define the Tool for the AI
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "aggregate_budgets",
    description: "Merges data from multiple budget sheets into one master sheet using DeepSeek AI.",
    inputSchema: {
      type: "object",
      properties: {
        source_urls: { 
          type: "array", 
          items: { type: "string" },
          description: "List of URLs for the source budget sheets"
        },
        master_url: { 
          type: "string",
          description: "URL of the master sheet to write to"
        }
      },
      required: ["source_urls", "master_url"]
    }
  }]
}));

// 4. Implement the Tool Logic
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "aggregate_budgets") throw new Error("Tool not found");

  const { source_urls, master_url } = request.params.arguments;

  try {
    // Read from all sources
    const allData = await Promise.all(source_urls.map(async (url) => {
      const id = extractId(url);
      const sheetName = await getSheetName(id);
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: `${sheetName}!A1:Z100`
      });
      return res.data.values;
    }));

    // Collect all unique categories
    const allCategories = new Set();
    const expenses = [];
    for (const data of allData) {
      if (data && data.length > 1) {
        const headers = data[0];
        const mapping = await getMapping(headers);
        for (let i = 1; i < data.length; i++) { // Skip header
          const row = data[i];
          const catIndex = mapping.category;
          const amtIndex = mapping.amount;
          if (catIndex === null || amtIndex === null) continue;
          if (row.length <= Math.max(catIndex, amtIndex)) continue;
          const category = row[catIndex]?.trim();
          const amountStr = row[amtIndex];
          if (!category || !amountStr) continue;
          const amount = parseFloat(amountStr);
          if (isNaN(amount)) continue;
          allCategories.add(category);
          expenses.push({ category, amount });
        }
      }
    }

    // Use LLM to normalize categories
    const categoriesList = Array.from(allCategories);
    const prompt = `Merge these budget categories into standardized, consolidated categories. Group similar ones (e.g., "Camera Gear" and "Photography Supplies" into "Photography"). Return ONLY a JSON object where keys are original categories and values are the standardized category names: ${JSON.stringify(categoriesList)}`;
    const completion = await client.chat.completions.create({
      model: "deepseek-ai/DeepSeek-V3.2:novita",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
    });
    const responseText = completion.choices[0].message.content;
    const categoryMapping = JSON.parse(responseText.replace(/```json|```/g, ""));

    // Apply mapping and sum amounts
    const categoryMap = new Map();
    for (const exp of expenses) {
      const normalized = categoryMapping[exp.category] || exp.category;
      categoryMap.set(normalized, (categoryMap.get(normalized) || 0) + exp.amount);
    }
    const tableData = [["Category", "Amount"], ...Array.from(categoryMap.entries()).sort()];
    const total = Array.from(categoryMap.values()).reduce((sum, val) => sum + val, 0);

    // Write to Master
    const masterId = extractId(master_url);
    const masterSheetName = await getSheetName(masterId);
    await sheets.spreadsheets.values.update({
      spreadsheetId: masterId,
      range: `${masterSheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: tableData }
    });

    return { content: [{ type: "text", text: `Master budget updated successfully! Total spending: ${total}` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

// 5. Connect the Transport
const transport = new StdioServerTransport();
await server.connect(transport);