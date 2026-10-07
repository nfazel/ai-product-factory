import { LaterStage } from "@/components/products/later-stage";

export const metadata = { title: "Build" };

export default function BuildPage() {
  return (
    <LaterStage
      title="Build"
      note="Development planning and implementation will connect to approved backlog items."
    />
  );
}
