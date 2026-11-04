/**
 * The top-level tabs. Plan covers what used to be Explore, Define and the design pages, which stay reachable as details from the
 * Plan page. Learn is hidden for now; its page still exists.
 */
export const productTabs = [
  { slug: "", label: "Overview" },
  { slug: "/plan", label: "Plan" },
  { slug: "/build", label: "Build" },
  { slug: "/testing", label: "Prove" },
  { slug: "/releases", label: "Ship" },
  { slug: "/intelligence", label: "Intelligence" },
] as const;
