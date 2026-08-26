{/* wraps every page, so a navbar appears in every page */}

import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "InvoiceFlow",
  description: "Inventory and invoice automation",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <nav className="border-b">
          <div className="mx-auto flex max-w-2xl gap-6 px-8 py-4 text-sm">
            <Link href="/" className="hover:underline">
              Stock
            </Link>
            <Link href="/products" className="hover:underline">
              Products
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}