import { SellerConsoleClient } from "./seller-console-client";

export const metadata = {
  title: "Seller Console | Agent Developer Console | Arc Agent Commerce",
  description: "Publish versioned external services and review seller revenue.",
};

export default function ConsoleSellerPage() {
  return <SellerConsoleClient />;
}
