'use client'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Activity, ArrowDown, ArrowRight, ArrowUp, Bot, Check, ChevronDown, Clock3, LoaderCircle, MessageSquareText, PackageCheck, Play, Route, Send, ShieldAlert, Truck, UserRound, Zap } from 'lucide-react'
import { useOperations } from '../OperationsProvider'
import { Badge, EmptyState, PageIntro, PriorityBadge, RelativeTime, TimeSaved } from '../ui'
import type { Activity as ActivityType, AgentRun } from '../../lib/types'

const quickActions=[{label:'Plan today’s deliveries',icon:Route,dispatch:true},{label:'Find delayed orders',icon:ShieldAlert,message:'Which deliveries are at risk of being late?'},{label:'Optimize driver assignments',icon:Truck,message:'Optimize driver assignments'},{label:'Generate daily report',icon:Activity,message:'Generate a daily operations report'}]
function describeAction(raw:string){
 const assigned=raw.match(/Assigned Order #(\d+) \(([^)]+)\) to (.*?); (.*) estimated (\d+) min\./i)
 if(assigned)return {title:`Assigned Order #${assigned[1]} to ${assigned[3]}`,detail:`${assigned[4]} · ${assigned[5]} min estimated`,kind:assigned[2]==='urgent'?'urgent':'assignment'}
 const retrieved=raw.match(/Retrieved (\d+) (.*)/i);if(retrieved)return {title:`Retrieved ${retrieved[1]} ${retrieved[2]}`,detail:'Read from live operations data',kind:'retrieval'}
 const checked=raw.match(/Checked (\d+) drivers; (\d+) available/i);if(checked)return {title:`Checked ${checked[1]} drivers`,detail:`${checked[2]} currently available for dispatch`,kind:'drivers'}
 const done=raw.match(/Dispatch plan completed: (\d+) assignments, (\d+) dispatcher minutes saved/i);if(done)return {title:'Generated and saved the dispatch plan',detail:`${done[1]} assignments · ${done[2]} min estimated time saved`,kind:'complete'}
 const risk=raw.match(/Reviewed (\d+) open orders for delivery risk/i);if(risk)return {title:`Reviewed ${risk[1]} open orders for delivery risk`,detail:'Checked delayed, failed and urgent orders',kind:'review'}
 return {title:raw,detail:'Recorded in the RouteFlow activity log',kind:'action'}
}
function actionTime(raw:string,events:ActivityType[]){const item=events.find(a=>a.description===raw);return item?.created_at}
function fallbackEvents(run:AgentRun){
 const raw=run.result.actions??[]
 const names=run.result.tool_calls?.map(t=>t.name)??[]
 const labels:Record<string,string>={get_pending_orders:'Retrieved pending delivery orders',get_today_orders:'Retrieved today’s delivery orders',get_available_drivers:'Checked available driver capacity',get_urgent_orders:'Retrieved urgent orders',get_at_risk_deliveries:'Checked at-risk deliveries',get_dispatch_plan:'Retrieved saved driver dispatch plan',get_driver_workloads:'Counted assignments by driver',get_dispatch_metrics:'Read dispatch time metrics',get_operations_summary:'Read today’s operations summary',get_order_details:'Read order details',explain_assignment:'Checked order assignment facts',calculate_driver_capacity:'Checked driver capacity',estimate_route:'Estimated zone-to-zone route time',assign_order_to_driver:'Assigned an order to a driver',reassign_delayed_orders:'Reassigned delayed orders to eligible alternate drivers',run_dispatch:'Generated the dispatch plan'}
 const tools=names.map(name=>({raw:`Tool: ${name}`,title:`Tool: ${name}`,detail:labels[name]??'Database-backed operations tool',kind:'retrieval'}))
 return [...tools,...raw.map(value=>({raw:value,...describeAction(value)})).reverse()]
}
function runMetrics(run:AgentRun){if(run.dispatch)return run.dispatch.metrics;const call=run.result.tool_calls?.find(t=>t.name==='run_dispatch');const result=call?.result as {metrics?:{orders_assigned?:number;orders_considered?:number;drivers_used?:number;urgent_handled?:number;estimated_time_saved_minutes?:number;estimated_time_saved_hours?:number};orders_assigned?:number;orders_considered?:number;drivers_used?:number;urgent_handled?:number;estimated_time_saved_minutes?:number;estimated_time_saved_hours?:number}|undefined;return result?.metrics??result}

function AgentPageLegacy(){
 const {ask,runDispatch,busy,history,currentAgentRun,activity,summary,error}=useOperations()
 const [message,setMessage]=useState(''),[waiting,setWaiting]=useState(''),[openHistory,setOpenHistory]=useState<number|null>(null),[activeId,setActiveId]=useState<number|null>(null)
 useEffect(()=>{if(currentAgentRun)setActiveId(currentAgentRun.id)},[currentAgentRun])
 const active=history.find(r=>r.id===activeId)??currentAgentRun
 const visibleRun=waiting?null:active
 const events=useMemo(()=>visibleRun?fallbackEvents(visibleRun):[],[visibleRun])
 const metrics=visibleRun?runMetrics(visibleRun):undefined
 async function submit(text:string,dispatch:boolean){if(!text.trim()||busy)return;setWaiting(text);setMessage('');try{if(dispatch)await runDispatch();else await ask(text)}catch{}finally{setWaiting('')}}
 function onSubmit(e:FormEvent){e.preventDefault();void submit(message,false)}
 const formatTime=(date?:string)=>date?new Date(date.endsWith('Z')?date:`${date}Z`).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''
 return <div className="page-stack agent-page"><PageIntro eyebrow="OPERATIONAL EMPLOYEE · TOOL ENABLED" title="RouteFlow AI" description="Autonomous logistics operations agent. Ask a question or let RouteFlow plan the dispatch." action={<span className="agent-capability"><Bot size={15}/> 8 operational tools connected</span>}/>
  <div className="agent-io-grid"><section className="surface-card agent-input-card"><div className="agent-section-head"><div className="section-icon"><MessageSquareText size={17}/></div><div><span className="section-kicker">SECTION 01</span><h3>Ask the agent</h3><p>Give RouteFlow a logistics task to work on.</p></div></div>
   <form className="agent-prompt" onSubmit={onSubmit}><textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Ask RouteFlow AI about today’s operations…" rows={3} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void submit(message,false)}}}/><div className="prompt-bottom"><span>RouteFlow checks live orders and drivers before answering.</span><button className="send-button" aria-label="Send request" disabled={busy||!message.trim()}><Send size={16}/></button></div></form>
   <div className="quick-heading">QUICK TASKS</div><div className="quick-task-grid">{quickActions.map(({label,icon:Icon,dispatch,message:task})=><button className="quick-task" key={label} disabled={busy} onClick={()=>void submit(task??label,Boolean(dispatch))}><Icon size={15}/><span>{label}</span><ArrowUp size={13}/></button>)}</div>
  </section>
  <section className="surface-card input-context"><div className="context-head"><span className="section-kicker">LIVE BUSINESS CONTEXT</span><Badge tone={error?'red':'green'}><i className={`online-dot ${error?'offline-dot':''}`}/> {error?'OFFLINE':'CONNECTED'}</Badge></div><h3>What the agent can see</h3><p>RouteFlow reads the current operations database for every request.</p><div className="context-list"><div><PackageCheck size={16}/><span>Orders in today’s queue</span><strong>{summary?.total_orders_today??'—'}</strong></div><div><Clock3 size={16}/><span>Pending / at risk</span><strong>{summary?.pending_orders??'—'}</strong></div><div><Zap size={16}/><span>Open urgent deliveries</span><strong>{summary?.urgent_orders??'—'}</strong></div><div><Truck size={16}/><span>Available drivers</span><strong>{summary?.available_drivers??'—'}</strong></div></div><div className="context-foot"><span><i/> SQLite operations data</span><span>Live read access</span></div></section></div>
  <section className="surface-card execution-card"><div className="agent-section-head execution-title"><div className="section-icon execution-icon"><Activity size={17}/></div><div><span className="section-kicker">SECTION 02 · AUDITABLE WORK</span><h3>Agent execution</h3><p>The request, tools, and recorded actions behind the response.</p></div><span className="execution-state">{busy?<><LoaderCircle size={14} className="spin"/> WORKING</>:visibleRun?<><Check size={14}/> COMPLETED</>:<><span className="idle-dot"/> READY</>}</span></div>
   {!visibleRun&&!waiting?<EmptyState title="No agent runs yet" description="Run a task to see RouteFlow AI inspect operations data and take action." icon={Bot}/>:<div className="execution-content">
    <div className="request-card"><span className="request-icon"><UserRound size={16}/></span><div><span>USER REQUEST</span><p>{waiting||visibleRun?.request}</p></div><time>{visibleRun?formatTime(visibleRun.completedAt):'In progress'}</time></div>
    {waiting&&busy&&!visibleRun&&<div className="execution-pending"><div className="execution-line"/><div className="execution-step"><span className="step-icon running"><LoaderCircle size={15} className="spin"/></span><div><strong>Request sent to RouteFlow operations tools</strong><span>Waiting for the backend agent to return live data and actions.</span></div><span className="step-time">IN PROGRESS</span></div></div>}
    {visibleRun&&<div className="execution-list"><div className="execution-line"/>{events.map((ev,index)=>{const time=actionTime(ev.raw,activity);return <div className="execution-step" key={`${visibleRun.id}-${index}`}><span className={`step-icon ${ev.kind==='urgent'?'step-warning':'step-done'}`}>{ev.kind==='urgent'?<Zap size={14}/>:<Check size={14}/>}</span><div><strong>{ev.title}</strong><span>{ev.detail}</span></div><span className="step-time">{time?formatTime(time):index===events.length-1?formatTime(visibleRun.completedAt):'COMPLETE'}</span></div>})}</div>}
   </div>}
  </section>
  <section className={`agent-result-card ${visibleRun?'result-visible':''}`}><div className="result-heading"><div className="result-mark"><Check size={19}/></div><div><span className="section-kicker">SECTION 03 · FINAL RESULT</span><h3>{visibleRun?(visibleRun.dispatch||metrics?'Dispatch plan created':'Operations analysis complete'):'Agent result'}</h3><p>{visibleRun?.result.response??'The agent’s verified outcome will appear here after a task completes.'}</p></div><Badge tone={visibleRun?'green':'neutral'}>{visibleRun?'COMPLETED':'WAITING'}</Badge></div>
   {visibleRun&&<><div className="result-metrics"><div><span>Orders assigned</span><strong>{metrics?.orders_assigned??(visibleRun.result.updated_orders?.length||0)}</strong></div><div><span>Urgent handled</span><strong>{metrics?.urgent_handled??'—'}</strong></div><div><span>Drivers used</span><strong>{metrics?.drivers_used??'—'}</strong></div><div><span>Time saved</span><strong>{metrics?.estimated_time_saved_minutes!==undefined?<TimeSaved minutes={metrics.estimated_time_saved_minutes}/>:`${summary?.estimated_time_saved_minutes??0} min`}</strong></div></div><div className="result-footer"><span><Check size={14}/> Actions are recorded in the operations audit trail.</span><Link className="button button-primary" href="/dispatch">View dispatch plan <ArrowRight size={14}/></Link></div></>}
  </section>
  <section className="surface-card history-card"><div className="history-title"><div><span className="section-kicker">SESSION</span><h3>Agent conversation history</h3></div><span>{history.length} {history.length===1?'request':'requests'}</span></div>{!history.length?<div className="history-empty">Previous requests will appear here for quick review.</div>:<div className="history-list">{history.map(run=><div className="history-item" key={run.id}><button className="history-toggle" onClick={()=>{setOpenHistory(openHistory===run.id?null:run.id);setActiveId(run.id)}}><span className="history-check"><Check size={13}/></span><span className="history-request">{run.request}</span><Badge tone="green">Completed</Badge><time>{formatTime(run.completedAt)}</time>{openHistory===run.id?<ChevronDown size={15}/>:<ArrowDown size={15}/>}</button>{openHistory===run.id&&<div className="history-expanded"><p>{run.result.response}</p><span>{run.result.actions.length} actions recorded · <RelativeTime value={run.completedAt}/></span></div>}</div>)}</div>}</section>
 </div>
}

export default function AgentPage(){
 const {ask,busy,history,activity,summary,error}=useOperations()
 const [message,setMessage]=useState(''),[pending,setPending]=useState('')
 const turns=useMemo(()=>[...history].reverse(),[history])
 async function submit(text:string,dispatch=false){if(!text.trim()||busy)return;setPending(text.trim());setMessage('');try{await ask(text.trim())}catch{}finally{setPending('')}}
 function onSubmit(e:FormEvent){e.preventDefault();void submit(message)}
 return <div className="page-stack agent-page"><PageIntro eyebrow="OPERATIONAL EMPLOYEE · TOOL ENABLED" title="RouteFlow AI" description="Ask about live operations or request a dispatch action." action={<span className="agent-capability"><Bot size={15}/> Database connected</span>}/>
  <section className="surface-card agent-chat"><div className="agent-chat-context"><span>LIVE OPERATIONS</span><strong>{summary?.pending_orders??'—'} dispatchable · {summary?.available_drivers??'—'} drivers available</strong></div>
   <div className="agent-chat-history" aria-live="polite">{!turns.length&&!pending&&<div className="agent-chat-welcome"><Bot size={22}/><strong>How can I help with today’s operations?</strong><span>Answers and actions are based on live RouteFlow data.</span></div>}
    {turns.map(run=><article className="agent-chat-turn" key={run.id}><div className="agent-chat-user"><span><UserRound size={15}/></span><p>{run.request}</p></div><div className="agent-chat-answer"><span><Bot size={15}/></span><div><p>{run.result.response}</p>{(run.result.tool_calls.length>0||run.result.actions.length>0)&&<details className="agent-chat-tools"><summary><Activity size={13}/> Operational activity</summary><div>{run.result.tool_calls.map((call,index)=><span key={`${run.id}-${index}`}>{call.name}</span>)}{run.result.actions.map((action,index)=><span key={`${run.id}-action-${index}`}>{action}</span>)}</div></details>}</div></div></article>)}
    {pending&&<article className="agent-chat-turn"><div className="agent-chat-user"><span><UserRound size={15}/></span><p>{pending}</p></div><div className="agent-chat-answer agent-chat-loading"><span><Bot size={15}/></span><p><i/> RouteFlow is checking live operations…</p></div></article>}
   </div>
   <div className="agent-chat-shortcuts">{[['Plan today’s deliveries',true],['Which drivers are available?',false],['How much time did the latest dispatch save?',false]].map(([label,dispatch])=><button key={String(label)} disabled={busy} onClick={()=>void submit(String(label),Boolean(dispatch))}>{label}</button>)}</div>
   <form className="agent-chat-composer" onSubmit={onSubmit}><textarea aria-label="Message RouteFlow AI" value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void submit(message)}}} placeholder="Ask about orders, drivers, dispatch, or request an action…" rows={2}/><button className="button button-primary" disabled={busy||!message.trim()}><Send size={15}/> Send</button></form>
   {error&&<p className="agent-chat-error" role="alert">{error}</p>}
  </section>
  <section className="agent-chat-audit"><Activity size={14}/><span>Tool activity is recorded in the backend operations log.</span><span>{activity.length} recorded events</span></section>
 </div>
}
