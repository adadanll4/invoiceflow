import { google } from "googleapis";

async function main() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });

  const drive = google.drive({ version: "v3", auth });

  const folder = await drive.files.create({
    requestBody: {
      name: "InvoiceFlow Receipts",
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id, webViewLink",
  });

  console.log("\nFolder created. Add this to .env.local:\n");
  console.log(`GOOGLE_DRIVE_FOLDER_ID=${folder.data.id}\n`);
  console.log(`View it at: ${folder.data.webViewLink}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});