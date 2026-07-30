import { SellerConsoleClient } from "./seller-console-client";
import { brandPageTitle } from "@/lib/brand";

export const metadata = {
  title: { absolute: brandPageTitle("Seller Console") },
  description: "Publish versioned external services and review seller revenue.",
};

export default function ConsoleSellerPage() {
  return <SellerConsoleClient />;
}
