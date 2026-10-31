import type {artifactRequirementsForView,requirementsViewLabel} from '@/modules/requirements-baseline/presentation';
type Artifact=Awaited<ReturnType<typeof artifactRequirementsForView>>;
export function RequirementsContextStatus({current,artifacts=[]}:{current:ReturnType<typeof requirementsViewLabel>;artifacts?:({label:string}&Artifact)[]}){
 return <section aria-label="Requirements context" className="rounded-xl border p-4 text-sm">
  <h2 className="font-medium">Requirements context</h2>
  <p>{current.baseline?`Current requirements: version ${current.baseline.version} (${current.baseline.id}), digest ${current.baseline.digest}.`:'Current requirements: legacy, with no versioned baseline.'}</p>
  {artifacts.length>0&&<ul className="mt-2 space-y-2">{artifacts.map((a,i)=><li key={`${a.label}:${i}`}>
   <strong>{a.label}: </strong>{a.historical?.baseline?`reviewed context ${a.historical.baseline.id}, digest ${a.historical.baseline.digest}. `:'Historical requirements context cannot be proved. '}
   {a.status==='CURRENT'?'Requirements membership remains applicable.':a.status==='STALE'?'Requirements context has changed.':a.status==='UNAVAILABLE'?'Context proof is unavailable.':'No historical pin is recorded.'}
  </li>)}</ul>}
  <p className="mt-2 text-muted-foreground">This information does not grant or change approval, verification or execution authority.</p>
 </section>;
}
