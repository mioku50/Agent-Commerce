import DeveloperToolsPage, { metadata as devToolsMetadata } from "@/app/developer-tools/page";
import { brandPageTitle } from "@/lib/brand";

export const metadata = {
  ...devToolsMetadata,
  title: { absolute: brandPageTitle("Developer Tools") },
};

export default DeveloperToolsPage;
