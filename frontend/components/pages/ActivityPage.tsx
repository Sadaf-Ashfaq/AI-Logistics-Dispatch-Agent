'use client'
import { useMemo, useState } from 'react'
import { Activity as ActivityIcon, ArrowDownWideNarrow, ArrowRight, BadgeAlert, Check, GitBranch, ShieldAlert, SlidersHorizontal, Zap } from 'lucide-react'
import { useOperations } from '../OperationsProvider'
import { Badge, EmptyState, Loading, PageIntro, RelativeTime } from '../ui'

const filters=[{key:'all',label:'All',icon:ActivityIcon},{key:'assignments',label:'Assignments',icon:GitBranch},{key:'priorities',label:'Priorities',icon:Zap},{key:'routes',label:'Route optimization',icon:ArrowDownWideNarrow},{key:'exceptions',label:'Exceptions',icon:ShieldAlert},{key:'status',label:'Status changes',icon:BadgeAlert}]
export default function ActivityPage(){
 const {activity,loading,refresh}=useOperations();const [filter,setFilter]=useState('all')
 const filtered=useMemo(()=>activity.filter(a=>{
  const text=a.description.toLowerCase()
  if(filter==='all')return true
  if(filter==='assignments')return a.action_type==='assignment'
  if(filter==='priorities')return /urgent|high priority|priorit/i.test(text)
  if(filter==='routes')return /route|zone|estimated \d+ min|group/i.test(text)
  if(filter==='exceptions')return /delay|failed|exception|risk|unassigned|capacity/i.test(text)
  if(filter==='status')return a.action_type==='status'
  return true
 }),[activity,filter])
 const badge=(type:string)=>type==='assignment'?{tone:'green',icon:GitBranch,label:'ASSIGNMENT'}:type==='dispatch'?{tone:'blue',icon:Check,label:'DISPATCH'}:type==='status'?{tone:'amber',icon:BadgeAlert,label:'STATUS'}:type==='fallback'?{tone:'amber',icon:ShieldAlert,label:'FALLBACK'}:{tone:'neutral',icon:ActivityIcon,label:'DATA READ'}
 return <div className="page-stack"><PageIntro eyebrow="AUDIT & OVERSIGHT" title="Agent Activity" description="Everything RouteFlow AI has done, recorded from live operations." action={<button className="button button-quiet" onClick={()=>void refresh()}><SlidersHorizontal size={15}/> Refresh log</button>}/>
  <section className="surface-card activity-surface"><div className="activity-filters">{filters.map(({key,label,icon:Icon})=><button key={key} className={`filter-chip ${filter===key?'filter-selected':''}`} onClick={()=>setFilter(key)}><Icon size={14}/>{label}<span>{key==='all'?activity.length:activity.filter(a=>{const text=a.description.toLowerCase();return key==='assignments'?a.action_type==='assignment':key==='priorities'?/urgent|high priority|priorit/i.test(text):key==='routes'?/route|zone|estimated \d+ min|group/i.test(text):key==='exceptions'?/delay|failed|exception|risk|unassigned|capacity/i.test(text):a.action_type==='status'}).length}</span></button>)}</div>
   <div className="activity-content">{loading?<Loading label="Loading the audit trail…"/>:!filtered.length?<EmptyState title={filter==='all'?'No agent runs yet':'No activity matches this filter'} description={filter==='all'?'Run a dispatch task to create an auditable record.':'Try another activity category.'} icon={ActivityIcon}/>:<div className="audit-timeline">{filtered.map((item,index)=>{const meta=badge(item.action_type),Icon=meta.icon;return <article key={item.id} className="audit-event"><div className={`audit-symbol ${item.action_type}`}><Icon size={15}/></div><div className="audit-rail">{index<filtered.length-1&&<i/>}</div><div className="audit-copy"><div className="audit-top"><strong>{item.description}</strong><Badge tone={meta.tone}><Icon size={11}/>{meta.label}</Badge></div><div className="audit-meta"><RelativeTime value={item.created_at}/><span>·</span>{new Date(item.created_at.endsWith('Z')?item.created_at:`${item.created_at}Z`).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}<span>·</span><span>RouteFlow AI</span>{item.entity_type==='order'&&item.entity_id&&<><span>·</span><span>Order #{item.entity_id}</span></>}</div></div></article>})}</div>}</div>
   <div className="audit-footer"><span><Check size={14}/> Activity is written by backend operations tools.</span><span>{filtered.length} of {activity.length} events</span></div>
  </section>
 </div>
}
