import { LaterStage } from "@/components/products/later-stage";

export const metadata = { title: "Releases" };

export default function ReleasesPage() {
  return (
    <LaterStage
      title="Releases"
      note="Release preparation will wait for human approval before anything is shipped."
    />
  );
}
