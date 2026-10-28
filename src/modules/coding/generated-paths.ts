/** Shared path helper with no Node/server imports — safe for client Code Review UI. */
const GENERATED_REVIEW_PATH = /(?:^|\/)(?:node_modules|\.next|\.prisma|src\/generated\/prisma)(?:\/|$)|\.tsbuildinfo$|next-env\.d\.ts$/;

export function isGeneratedReviewPath(filePath: string) {
  return GENERATED_REVIEW_PATH.test(filePath.replaceAll("\\", "/"));
}
