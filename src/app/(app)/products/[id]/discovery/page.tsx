import { LaterStage } from "@/components/products/later-stage";

export const metadata = { title: "Discovery" };

export default function DiscoveryPage() {
  return (
    <LaterStage
      title="Discovery"
      note="Product discovery will help teams explore problems and users. A person will still decide what is worth defining."
    />
  );
}
