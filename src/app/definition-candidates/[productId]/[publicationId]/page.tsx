import {Suspense} from 'react';
import Link from 'next/link';
import {loadDefinitionCandidateInspection} from '@/modules/requirements/candidate-inspection';
import {DefinitionCandidateView} from '@/components/definition/candidate-inspection';
import {markDynamic} from '@/server/dynamic';
export const metadata={title:'Inspect definition candidate'};
export default function CandidatePage({params}:{params:Promise<{productId:string;publicationId:string}>}){return <Suspense fallback={<p>Loading candidate…</p>}><Candidate params={params}/></Suspense>}
async function Candidate({params}:{params:Promise<{productId:string;publicationId:string}>}){
 await markDynamic();const {productId,publicationId}=await params;
 let candidate:Awaited<ReturnType<typeof loadDefinitionCandidateInspection>>;
 try{candidate=await loadDefinitionCandidateInspection(productId,publicationId)}catch{return <main className="mx-auto max-w-4xl space-y-4 p-6"><h1 className="text-2xl font-semibold">Candidate inspection unavailable</h1><p>Candidate ownership or integrity could not be established. No candidate content is shown.</p><Link prefetch={false} className="underline" href={`/definition-candidates/${encodeURIComponent(productId)}`}>Published candidates</Link></main>}
 return <main className="mx-auto max-w-5xl space-y-5 p-6"><Link prefetch={false} className="text-sm underline" href={`/definition-candidates/${encodeURIComponent(productId)}`}>All published candidates for {candidate.product.name}</Link><DefinitionCandidateView candidate={candidate}/></main>;
}
