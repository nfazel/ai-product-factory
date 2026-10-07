export type DecisionRecord = {
  id: string;
  productId: string;
  productName: string;
  workItemId: string | null;
  workItemTitle: string | null;
  title: string;
  description: string;
  decision: string;
  reason: string;
  decisionMaker: string;
  createdAt: Date;
};

export type CreateDecisionInput = {
  productId: string;
  workItemId?: string;
  title: string;
  description: string;
  decision: string;
  reason: string;
  decisionMaker: string;
};
