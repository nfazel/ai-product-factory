import {Suspense} from 'react';
import Link from 'next/link';
import {listDefinitionCandidateInspections} from '@/modules/requirements/candidate-inspection';
import {markDynamic} from '@/server/dynamic';
export const metadata={title:'Published definition candidates'};
export default function CandidateListPage({params}:{params:Promise<{productId:string}>}){return <Suspense fallback={<p>Loading published candidates…</p>}><CandidateList params={params}/></Suspense>}
async function CandidateList({params}:{params:Promise<{productId:string}>}){
 await markDynamic();const {productId}=await params;
 let result:Awaited<ReturnType<typeof listDefinitionCandidateInspections>>;
 try{result=await listDefinitionCandidateInspections(productId)}catch{return <main className="mx-auto max-w-4xl space-y-4 p-6"><h1 className="text-2xl font-semibold">Candidate inspection unavailable</h1><p>Candidate ownership or integrity could not be established. No candidate content is shown.</p><Link prefetch={false} href={`/products/${encodeURIComponent(productId)}/definition`} className="underline">Return to Define</Link></main>}
 return <main className="mx-auto max-w-4xl space-y-5 p-6">
  <Link prefetch={false} href={`/products/${encodeURIComponent(productId)}/definition`} className="text-sm underline">Return to Define</Link>
  <h1 className="text-2xl font-semibold">Published definition candidates</h1><p>{result.product.name}</p>
  <p>Inspect original AI proposals and their traceability. Publication does not select or approve a definition.</p>
  {!result.candidates.length?<p>No immutable definition candidates have been published.</p>:<ul className="space-y-3">{result.candidates.map(c=><li key={c.publicationId} className="space-y-2 rounded-xl border p-4">
   <Link prefetch={false} className="break-all font-medium underline" href={`/definition-candidates/${encodeURIComponent(productId)}/${encodeURIComponent(c.publicationId)}`}>Inspect candidate {c.artifactId}</Link>
   <p className="whitespace-pre-wrap text-sm">{c.proposal.assistantSummary}</p><p className="text-sm">AI-generated · <time dateTime={c.generatedAt}>{c.generatedAt}</time></p><p className="text-sm">{c.requirements.mode} · Requirements {c.requirements.applicability} · Unselected · Not approved</p>
  </li>)}</ul>}
 </main>;
}
