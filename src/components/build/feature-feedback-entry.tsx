'use client';
import {useState} from 'react';
import {FeatureFeedbackPanel} from './feature-feedback';
/** Feedback remains inspectable when independent technical status cannot load. */
export function FeatureFeedbackEntry({productId,featureId,title}:{productId:string;featureId:string;title:string}){const[open,setOpen]=useState(false);return <><button type="button" onClick={()=>setOpen(true)}>Request Changes</button>{open&&<FeatureFeedbackPanel productId={productId} featureId={featureId} title={title} onClose={()=>setOpen(false)}/>}</>}
