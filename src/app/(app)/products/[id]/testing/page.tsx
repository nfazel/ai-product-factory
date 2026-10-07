import { LaterStage } from "@/components/products/later-stage";

export const metadata = { title: "Testing" };

export default function TestingPage() {
  return (
    <LaterStage
      title="Testing"
      note="Proving the product will be tied to acceptance criteria. Nothing runs automatically in this foundation."
    />
  );
}
