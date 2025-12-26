# Budget Aggregator MCP Server

This project provides an MCP server for aggregating budget data from multiple Google Sheets into a master sheet, using AI for intelligent category normalization and column identification.

## Requirements

- Node.js (version 16 or higher)
- Google Service Account with access to Google Sheets API
- Hugging Face account with access token for DeepSeek model

## Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd budget-mcp-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in the required values:
     - `GOOGLE_SERVICE_ACCOUNT_JSON`: JSON key for your Google Service Account
     - `HF_TOKEN`: Your Hugging Face token for accessing DeepSeek model

4. Ensure your Google Service Account has the following scopes:
   - `https://www.googleapis.com/auth/spreadsheets`

5. Grant editor access to the service account: Share your source and master Google Sheets with `budget-aggregator-agent@aggregator-agent.iam.gserviceaccount.com` as an editor to allow modification.

## Running the Aggregation Script

To run the budget aggregation:

```bash
node aggregate.js
```

You will be prompted to enter:
- Source Google Sheet URLs (separated by commas)
- Master Google Sheet URL

The script will then:
- Read data from the specified source Google Sheets
- Use AI to identify category and amount columns
- Normalize budget categories
- Aggregate amounts by category
- Update the master sheet
- Output the total spending

## Running the MCP Server

To start the MCP server:

```bash
npm start
```

This exposes the `aggregate_budgets` tool for AI assistants that support MCP.

## Usage with AI Assistants

When connected to an MCP-compatible AI assistant, you can use the `aggregate_budgets` tool by providing:
- `source_urls`: Array of Google Sheet URLs to aggregate from
- `master_url`: URL of the master sheet to write aggregated data to

## Project Structure

- `src/index.js`: MCP server implementation
- `aggregate.js`: Standalone aggregation script
- `.env.example`: Example environment variables
- `package.json`: Node.js dependencies and scripts

## Notes

- Ensure all Google Sheets are accessible by the service account.
- The AI models used are hosted via Hugging Face, requiring a valid token.
