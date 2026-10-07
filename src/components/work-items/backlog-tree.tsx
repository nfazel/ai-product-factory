import { WorkItemRow } from "@/components/work-items/work-item-row";
import type { WorkItemNode } from "@/domain/work-item-tree";
import type { WorkItemSummary } from "@/modules/work-item/types";

export function BacklogTree({
  nodes,
}: {
  nodes: WorkItemNode<WorkItemSummary>[];
}) {
  return (
    <ul className="space-y-3">
      {nodes.map((node) => (
        <li key={node.id}>
          <WorkItemRow item={node} />
          {node.children.length > 0 ? (
            <div className="mt-3 ml-3 border-l pl-4 sm:ml-5">
              <BacklogTree nodes={node.children} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
