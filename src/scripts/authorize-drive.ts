import { createServer } from "node:http";
import { google } from "googleapis";

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
const PORT = 3939;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

async function main() {
  const client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive.file"],
  });

  console.log("\nOpen this URL and log in with your PERSONAL Google account:\n");
  console.log(authUrl, "\n");

  const code: string = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, REDIRECT_URI);
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");

      if (error) {
        res.end("Authorization was denied. You can close this tab.");
        server.close();
        reject(new Error(`Authorization denied: ${error}`));
        return;
      }

      if (!code) return;

      res.end("Success — you can close this tab and return to the terminal.");
      server.close();
      resolve(code);
    });

    server.listen(PORT);
  });

  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    console.error(
      "\nNo refresh token came back. Go to https://myaccount.google.com/permissions, " +
      "remove access for 'InvoiceFlow', then run this script again.\n"
    );
    process.exit(1);
  }

  console.log("\nAdd this line to .env.local:\n");
  console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});