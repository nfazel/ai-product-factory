import { ComingSoon } from "@/components/feedback/states";

export function LaterStage({
  title,
  note,
}: {
  title: string;
  note: string;
}) {
  return <ComingSoon title={title} note={note} />;
}
