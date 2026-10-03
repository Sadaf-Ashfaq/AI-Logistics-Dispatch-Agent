'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Bot, Boxes, BrainCircuit, Check, CircleAlert, CircleDot, Clock3, Code2, Database, FileText, GitBranch, LoaderCircle, Maximize, MessageSquareText, PackageCheck, RotateCcw, Route, Send, ShieldCheck, Truck, UserRound, Workflow, Wrench, ZoomIn, ZoomOut } from 'lucide-react'
import { getData } from '../../lib/api'
import type { AgentTool, DispatchResult } from '../../lib/types'
import { useOperations } from '../OperationsProvider'
import { Badge, Loading, PageIntro, RelativeTime } from '../ui'

type Category='input'|'api'|'agent'|'logic'|'tool'|'action'|'database'|'output'
type NodeDef={id:string;title:string;subtitle:string;category:Category;x:number;y:number;icon:typeof Bot;toolName?:string;detail:string;inputs?:string[];outputs?:string[]}
type Point={x:number;y:number}
const W=1580,H=690,NW=210,NH=118
const nodeDefs:NodeDef[]=[
 {id:'request',title:'User request',subtitle:'Question or dispatch instruction',category:'input',x:30,y:34,icon:UserRound,detail:'The request comes from the RouteFlow Agent chat, or dispatch can start from the operations dashboard.',inputs:['Agent chat message','Dispatch button'],outputs:['Request body']},
 {id:'api',title:'Agent API',subtitle:'Chat and dispatch endpoints',category:'api',x:290,y:34,icon:Send,detail:'FastAPI routes POST /agent/chat to the chat orchestrator and POST /agent/dispatch to the dispatch service.',inputs:['ChatRequest.message (chat)','Database session'],outputs:['Agent result or DispatchResult']},
 {id:'agent',title:'AI Operations Agent',subtitle:'chat() · _response()',category:'agent',x:550,y:34,icon:BrainCircuit,detail:'The orchestrator handles supported operational intents with database-backed tools. If configured, an OpenAI-compatible model can select tools; otherwise deterministic intent handling is used.',inputs:['User message','SQLAlchemy session'],outputs:['Response','Tool calls','Updated orders']},
 {id:'select',title:'Select operation',subtitle:'Intent routing / tool choice',category:'logic',x:810,y:34,icon:GitBranch,detail:'Intent matching selects an existing operational action or a read tool. This is orchestration logic, not a separate backend tool.',inputs:['Request text'],outputs:['Read operation','Dispatch action','Direct answer']},
 {id:'decision',title:'Dispatchable orders?',subtitle:'Unassigned · today · pending or delayed',category:'logic',x:1070,y:288,icon:CircleDot,detail:'The dispatch service selects today’s pending or delayed orders that have no assigned driver. If that set is empty, it returns no work or the saved latest plan.',inputs:['requested_date=today','status pending/delayed','no assigned driver'],outputs:['YES → check drivers','NO → up-to-date / no-work response']},
 {id:'dispatch',title:'Run dispatch',subtitle:'run_dispatch(db)',category:'tool',x:1070,y:34,icon:Workflow,toolName:'run_dispatch',detail:'The existing dispatch service orders eligible work by priority, checks driver availability and package/stop capacity, estimates routes, and assigns eligible orders.',inputs:['SQLAlchemy Session'],outputs:['Assignments','Dispatch metrics','AgentAction records']},
 {id:'pending',title:'Load pending orders',subtitle:'today · pending/delayed · unassigned',category:'database',x:1330,y:34,icon:PackageCheck,detail:'run_dispatch queries today’s pending and delayed orders with no assigned driver. The separate get_pending_orders Agent tool reads the same eligible queue when the chat orchestrator selects it.',inputs:['requested_date=today','status pending/delayed','assigned_driver_id is null'],outputs:['Order records']},
 {id:'drivers',title:'Load available drivers',subtitle:'dispatch_service · availability query',category:'database',x:810,y:288,icon:Truck,detail:'run_dispatch queries drivers whose status and availability are both available. The separate get_available_drivers Agent tool returns this roster with remaining stops and vehicle capacity.',inputs:['status=available','availability=available'],outputs:['Driver records']},
 {id:'rules',title:'Apply dispatch rules',subtitle:'Priority · capacity · availability',category:'logic',x:550,y:288,icon:ShieldCheck,detail:'Internal dispatch-service logic sorts by priority, then filters drivers by availability, daily stop limit, and package weight. This is not a standalone Agent tool.',inputs:['Eligible orders','Available drivers'],outputs:['Order/driver candidates']},
 {id:'route',title:'Estimate route',subtitle:'route_service.estimate_route()',category:'logic',x:290,y:288,icon:Route,detail:'The route service estimates travel minutes between zones. run_dispatch calls this while scoring candidate drivers; the Agent also exposes estimate_route as a callable tool.',inputs:['from_zone','to_zone'],outputs:['estimated_minutes']},
 {id:'assign',title:'Assign eligible orders',subtitle:'dispatch_service.assign()',category:'action',x:290,y:542,icon:Boxes,detail:'The dispatch service helper sets order.assigned_driver_id and status, updates the driver’s daily delivery count and zone, creates a DeliveryAssignment, and logs an assignment AgentAction. The separate assign_order_to_driver tool is available for one-order Agent actions.',inputs:['Order','Driver','sequence'],outputs:['Updated Order','DeliveryAssignment','Assignment action']},
 {id:'database',title:'Operations database',subtitle:'SQLite · SQLAlchemy',category:'database',x:550,y:542,icon:Database,detail:'Persistent application tables used by the current workflow.',inputs:['Read orders and drivers','Write assignments and run metrics'],outputs:['orders','drivers','assignments','dispatch_runs','agent_actions']},
 {id:'summary',title:'Save dispatch result',subtitle:'DispatchRun · AgentAction',category:'database',x:810,y:542,icon:FileText,detail:'Successful dispatches persist metrics in DispatchRun and record tool, assignment, and dispatch events as AgentAction rows. The latest-dispatch API reconstructs the saved plan from these records.',inputs:['Counts and timing metrics','Actions'],outputs:['Persisted latest plan','Audit activity']},
 {id:'response',title:'Agent response',subtitle:'Chat answer · shared live state',category:'output',x:1070,y:542,icon:MessageSquareText,detail:'The Agent returns a concise response. Overview, Dispatch, Reports, and Activity read the persisted backend result and audit events.',inputs:['Backend response'],outputs:['Conversation answer','Synchronized operation state']},
 {id:'no-work',title:'No new work',subtitle:'Keep the saved plan · explain status',category:'output',x:1330,y:288,icon:CircleAlert,detail:'If there are no new eligible orders and a real dispatch was already processed today, the API reports that it is up to date and returns the saved plan. With no prior plan, it reports that no dispatchable orders are available.',inputs:['Empty eligible-order query'],outputs:['Already-up-to-date or no-work response']},
]
const edges=[['request','api'],['api','agent'],['agent','select'],['select','dispatch'],['dispatch','pending'],['pending','decision'],['decision','drivers','YES'],['decision','no-work','NO'],['drivers','rules'],['rules','route'],['route','assign'],['assign','database'],['database','summary'],['summary','response'],['no-work','response']] as const
const fallbackTools:AgentTool[]=[
 {name:'get_pending_orders',description:"Read today's pending and delayed orders",parameters:{},required:[]},
 {name:'get_today_orders',description:"Read all of today's orders and statuses",parameters:{},required:[]},
 {name:'get_available_drivers',description:'Read available drivers and remaining capacity',parameters:{},required:[]},
 {name:'get_urgent_orders',description:'Read urgent orders that are not delivered or failed',parameters:{},required:[]},
 {name:'get_at_risk_deliveries',description:'Find delayed, failed, and past-promise open deliveries',parameters:{},required:[]},
 {name:'get_dispatch_plan',description:"Read today's saved delivery assignments and sequence",parameters:{},required:[]},
 {name:'get_driver_workloads',description:"Count today's actual assignments per driver",parameters:{},required:[]},
 {name:'get_dispatch_metrics',description:'Read the latest persisted dispatch time metrics',parameters:{},required:[]},
 {name:'get_operations_summary',description:"Read today's operations summary",parameters:{},required:[]},
 {name:'get_order_details',description:'Read an order',parameters:{order_id:{type:'integer'}},required:['order_id']},
 {name:'explain_assignment',description:'Read assignment facts for an order',parameters:{order_id:{type:'integer'}},required:['order_id']},
 {name:'calculate_driver_capacity',description:'Read remaining stops and package capacity',parameters:{driver_id:{type:'integer'}},required:['driver_id']},
 {name:'estimate_route',description:'Estimate route minutes',parameters:{from_zone:{type:'string'},to_zone:{type:'string'}},required:['from_zone','to_zone']},
 {name:'assign_order_to_driver',description:'Assign one eligible unassigned order',parameters:{order_id:{type:'integer'},driver_id:{type:'integer'}},required:['order_id','driver_id']},
 {name:'reassign_delayed_orders',description:"Reassign today's delayed orders to another eligible driver",parameters:{},required:[]},
 {name:'run_dispatch',description:"Dispatch today's eligible orders using existing business rules",parameters:{},required:[]},
]
const categoryLabel:Record<Category,string>={input:'USER INPUT',api:'API',agent:'AGENT',logic:'DECISION',tool:'TOOL',action:'ACTION',database:'DATABASE',output:'OUTPUT'}
const defaultPoints=Object.fromEntries(nodeDefs.map(n=>[n.id,{x:n.x,y:n.y}])) as Record<string,Point>
function edgePath(a:Point,b:Point){
 const ax=a.x+NW/2,ay=a.y+NH/2,bx=b.x+NW/2,by=b.y+NH/2
 if(Math.abs(bx-ax)>Math.abs(by-ay)){const startX=bx>ax?a.x+NW:a.x,endX=bx>ax?b.x:b.x+NW,sy=ay,ey=by,curve=Math.max(45,Math.abs(endX-startX)*.42);return `M ${startX} ${sy} C ${startX+(bx>ax?curve:-curve)} ${sy}, ${endX-(bx>ax?curve:-curve)} ${ey}, ${endX} ${ey}`}
 const startY=by>ay?a.y+NH:a.y,endY=by>ay?b.y:b.y+NH,curve=Math.max(38,Math.abs(endY-startY)*.45);return `M ${ax} ${startY} C ${ax} ${startY+(by>ay?curve:-curve)}, ${bx} ${endY-(by>ay?curve:-curve)}, ${bx} ${endY}`
}
function toolsOf(run:ReturnType<typeof useOperations>['history'][number]|null){return new Set(run&&!run.dispatch?run.result.tool_calls.map(c=>c.name):[])}
function formatWhen(value?:string|null){return value?new Date(`${value}${value.endsWith('Z')?'':'Z'}`).toLocaleString():'Not recorded'}

export default function AgentWorkflowPage(){
 const {history,currentAgentRun,lastDispatch,activity,busy,error}=useOperations()
 const [tools,setTools]=useState<AgentTool[]>([]),[toolsLoading,setToolsLoading]=useState(true)
 const [selected,setSelected]=useState<NodeDef>(nodeDefs[2]),[zoom,setZoom]=useState(.7),[points,setPoints]=useState(defaultPoints),[dragging,setDragging]=useState<string|null>(null)
 const viewport=useRef<HTMLDivElement>(null)
 useEffect(()=>{getData<AgentTool[]>('/agent/tools').then(setTools).catch(()=>setTools(fallbackTools)).finally(()=>setToolsLoading(false))},[])
 const latestRun=history[0]??currentAgentRun
 const toolCalls=latestRun&&!latestRun.dispatch?latestRun.result.tool_calls:[]
 const calledTools=useMemo(()=>toolsOf(latestRun),[latestRun])
 const actions=latestRun?(latestRun.dispatch?.actions??latestRun.result.actions):(lastDispatch?.actions||[])
 const dispatchToolResult=toolCalls.find(c=>c.name==='run_dispatch')?.result as {metrics?:DispatchResult['metrics'];summary?:string;status?:DispatchResult['status'];assignments?:DispatchResult['assignments'];actions?:string[];dispatched_at?:string|null}|undefined
 const dispatchResult=latestRun?(latestRun.dispatch??(dispatchToolResult?.metrics?dispatchToolResult as DispatchResult:null)):lastDispatch
 const dispatchWasCalled=Boolean(latestRun?(latestRun.dispatch||dispatchToolResult):lastDispatch)
 const noWork=latestRun?.dispatch?.status==='no_work'||latestRun?.dispatch?.status==='already_up_to_date'||toolCalls.some(c=>['no_work','already_up_to_date'].includes((c.result as {status?:string}|undefined)?.status??''))
 const completedActions=actions.join('\n')
 const hasAssignment=/Assigned Order #\d+/.test(completedActions)||(latestRun?.result.updated_orders.length??0)>0
 const routeEstimated=/estimated \d+ min\./i.test(completedActions)||hasAssignment
 const actionFor=(id:string)=>{
  if(busy&&id==='agent')return 'running'
  if(error&&/could not be completed|could not complete that request/i.test(error)&&id==='api')return 'failed'
  if(!latestRun&&!lastDispatch)return 'idle'
  if(id.startsWith('tool:'))return calledTools.has(id.slice(5))?'completed':'idle'
  if(id==='request'||id==='api'||id==='agent'||id==='select')return latestRun?'completed':'idle'
  if(id==='decision')return noWork||dispatchWasCalled?'completed':'idle'
  if(id==='no-work')return noWork?'completed':'idle'
  if(id==='dispatch')return dispatchWasCalled?'completed':'idle'
  if(id==='pending')return calledTools.has('get_pending_orders')||/Retrieved \d+ dispatchable orders/i.test(completedActions)?'completed':'idle'
  if(id==='drivers')return calledTools.has('get_available_drivers')||/Checked \d+ drivers;/i.test(completedActions)?'completed':'idle'
  if(id==='rules')return dispatchResult?.metrics.orders_considered?'completed':'idle'
  if(id==='route')return routeEstimated?'completed':'idle'
  if(id==='assign')return hasAssignment?'completed':'idle'
  if(id==='database')return hasAssignment||/Dispatch plan completed:/i.test(completedActions)?'completed':'idle'
  if(id==='summary')return /Dispatch plan completed:/i.test(completedActions)||calledTools.has('get_operations_summary')?'completed':'idle'
  if(id==='response')return latestRun?'completed':'idle'
  return 'idle'
 }
 const fit=useCallback(()=>{const el=viewport.current;if(!el)return;setZoom(Math.min(1,el.clientWidth/W,(el.clientHeight-16)/H))},[])
 useEffect(()=>{fit();const observer=new ResizeObserver(fit);if(viewport.current)observer.observe(viewport.current);return()=>observer.disconnect()},[fit])
 const beginDrag=(e:React.PointerEvent<HTMLDivElement>,id:string)=>{if((e.target as HTMLElement).closest('button'))return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setDragging(id)}
 const moveNode=(e:React.PointerEvent<HTMLDivElement>,id:string)=>{if(dragging!==id)return;setPoints(old=>({...old,[id]:{x:Math.max(0,old[id].x+e.movementX/zoom),y:Math.max(0,old[id].y+e.movementY/zoom)}}))}
 const endDrag=()=>setDragging(null)
 const availableToolCalls=toolCalls.map(c=>({name:c.name,args:c.arguments||{}}))
 const currentAnswer=latestRun?.result.response??latestRun?.dispatch?.summary??lastDispatch?.summary
 const position=(id:string)=>points[id]??defaultPoints[id]
 const pickTool=(tool:AgentTool)=>{setSelected({id:`tool:${tool.name}`,title:tool.name,subtitle:tool.description,category:tool.name==='run_dispatch'?'tool':tool.name.startsWith('assign')||tool.name.startsWith('reassign')?'action':'tool',x:0,y:0,icon:Wrench,toolName:tool.name,detail:tool.description,inputs:Object.keys(tool.parameters),outputs:[]})}
 return <div className="page-stack workflow-page">
  <PageIntro eyebrow="ROUTEFLOW AI · SYSTEM MAP" title="Agent Workflow" description="Autonomous logistics operations workflow — a live view of the real agent, tools, dispatch service, and database." action={<Badge tone={busy?'amber':latestRun||lastDispatch?'green':'neutral'}>{busy?<><LoaderCircle size={12} className="workflow-spin"/> RUNNING</>:latestRun||lastDispatch?<><Check size={12}/> EXECUTION DATA</>:'IDLE'}</Badge>}/>
  <section className="surface-card workflow-shell">
   <div className="workflow-toolbar"><div className="workflow-toolbar-title"><Workflow size={18}/><div><strong>Dispatch workflow</strong><span>{busy?'Agent request in progress':latestRun?`Latest request: ${latestRun.request}`:lastDispatch?'Persisted latest dispatch plan':'Ready to visualize the next Agent request'}</span></div></div><div className="workflow-controls"><button aria-label="Zoom out" title="Zoom out" onClick={()=>setZoom(z=>Math.max(.35,z-.1))}><ZoomOut size={16}/></button><span>{Math.round(zoom*100)}%</span><button aria-label="Zoom in" title="Zoom in" onClick={()=>setZoom(z=>Math.min(1.35,z+.1))}><ZoomIn size={16}/></button><button onClick={fit}><Maximize size={15}/> Fit</button><button onClick={()=>{setPoints(defaultPoints);setZoom(.7)}}><RotateCcw size={14}/> Reset</button></div></div>
   <div className="workflow-legend">{([['agent','Agent'],['tool','Tool'],['database','Database'],['action','Action'],['output','Output']] as [Category,string][]).map(([cat,label])=><span key={cat}><i className={`legend-dot ${cat}`}/>{label}</span>)}<span className="workflow-live-key"><i/> completed from backend evidence</span></div>
   <div className="workflow-viewport" ref={viewport}>
    <div className="workflow-scaled" style={{width:W*zoom,height:H*zoom}}><div className="workflow-stage" style={{width:W,height:H,transform:`scale(${zoom})`}}>
     <svg className="workflow-edges" viewBox={`0 0 ${W} ${H}`} aria-hidden="true"><defs><marker id="edge-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z"/></marker></defs>{edges.map(([from,to,label])=>{const a=position(from),b=position(to);return <g className={`workflow-edge ${label==='NO'?'edge-no':''}`} key={`${from}-${to}`}><path d={edgePath(a,b)} markerEnd="url(#edge-arrow)"/>{label&&<text x={(a.x+b.x)/2+NW/2} y={(a.y+b.y)/2+NH/2-8}>{label}</text>}</g>})}</svg>
     {nodeDefs.map(def=>{const Icon=def.icon,state=actionFor(def.id),p=position(def.id);return <div key={def.id} role="button" tabIndex={0} aria-label={`${def.title}, ${state}`} onClick={()=>setSelected(def)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(def)}}} onPointerDown={e=>beginDrag(e,def.id)} onPointerMove={e=>moveNode(e,def.id)} onPointerUp={endDrag} onPointerCancel={endDrag} className={`workflow-node node-${def.category} state-${state} ${selected.id===def.id?'node-selected':''} ${dragging===def.id?'node-dragging':''}`} style={{left:p.x,top:p.y}}>
       <div className="workflow-node-head"><span className="workflow-node-icon"><Icon size={17}/></span><span className="workflow-node-category">{categoryLabel[def.category]}</span><span className="workflow-node-state">{state==='completed'?<Check size={13}/>:state==='running'?<LoaderCircle size={13} className="workflow-spin"/>:state==='failed'?<CircleAlert size={13}/>:<span className="node-state-dot"/>}</span></div>
       <strong>{def.title}</strong><span className="workflow-node-subtitle">{def.subtitle}</span>{def.toolName&&<code>{def.toolName}</code>}
      </div>})}
    </div></div>
   </div>
   <div className="workflow-canvas-footer"><span><CircleDot size={13}/> Drag nodes to arrange · select a node for details</span><span>Current state uses Agent tool calls and persisted operations activity</span></div>
  </section>
  <div className="workflow-lower-grid">
   <section className="surface-card workflow-tools-panel"><div className="workflow-panel-heading"><div><span className="section-kicker">BACKEND TOOL REGISTRY</span><h3>Tools available to the Agent</h3><p>Names and input schemas come from this project’s actual agent tool definitions.</p></div><Badge tone="blue">{tools.length} tools</Badge></div>
    {toolsLoading?<Loading label="Loading tools from the backend…"/>:<div className="workflow-tool-grid">{tools.map(tool=>{const wasCalled=calledTools.has(tool.name);return <button key={tool.name} onClick={()=>pickTool(tool)} className={`workflow-tool-card ${wasCalled?'tool-called':''}`}><span className="tool-card-icon">{tool.name==='run_dispatch'?<Workflow size={15}/>:tool.name.startsWith('assign')||tool.name.startsWith('reassign')?<Boxes size={15}/>:tool.name.includes('metric')||tool.name.includes('summary')||tool.name.includes('workload')?<FileText size={15}/>:<Wrench size={15}/>}</span><span><strong>{tool.name}</strong><small>{tool.description}</small></span>{wasCalled&&<Check size={14} className="tool-called-check"/>}</button>})}</div>}
   </section>
   <aside className="surface-card workflow-details"><div className="workflow-panel-heading"><div><span className="section-kicker">SELECTED NODE</span><h3>{selected.title}</h3></div><span className={`detail-category ${selected.category}`}>{categoryLabel[selected.category]}</span></div><p className="workflow-detail-description">{selected.detail}</p>{selected.toolName&&<div className="workflow-detail-tool"><Code2 size={15}/><code>{selected.toolName}</code><span>Backend tool</span></div>}
    {selected.inputs&&selected.inputs.length>0&&<div className="workflow-detail-section"><strong>Inputs</strong><ul>{selected.inputs.map(input=><li key={input}><code>{input}</code></li>)}</ul></div>}
    {selected.outputs&&selected.outputs.length>0&&<div className="workflow-detail-section"><strong>Outputs / records</strong><ul>{selected.outputs.map(output=><li key={output}>{output}</li>)}</ul></div>}
    {selected.toolName&&<div className="workflow-detail-section"><strong>Tool schema</strong><ul>{tools.find(t=>t.name===selected.toolName)?.required.map(param=><li key={param}><code>{param}</code> <em>required</em></li>)}{Object.entries(tools.find(t=>t.name===selected.toolName)?.parameters??{}).filter(([key])=>!tools.find(t=>t.name===selected.toolName)?.required.includes(key)).map(([key,value])=><li key={key}><code>{key}</code> <em>{value.type}</em></li>)}</ul></div>}
    <div className="workflow-detail-status"><span>Observed execution</span><Badge tone={actionFor(selected.id)==='completed'?'green':actionFor(selected.id)==='running'?'amber':actionFor(selected.id)==='failed'?'red':'neutral'}>{actionFor(selected.id).replace('_',' ')}</Badge></div>
   </aside>
  </div>
  <section className="workflow-execution-strip"><div className="execution-strip-heading"><div><span className="section-kicker">LATEST EXECUTION CONTEXT</span><h3>{busy?'Agent request in progress':latestRun?.request??(lastDispatch?'Persisted dispatch result':'No Agent request recorded in this session')}</h3></div>{!busy&&latestRun?.completedAt?<RelativeTime value={latestRun.completedAt}/>:!busy&&lastDispatch?.dispatched_at?<span><Clock3 size={13}/>{formatWhen(lastDispatch.dispatched_at)}</span>:null}</div>
   {!busy&&currentAnswer?<p>{currentAnswer}</p>:<p>{busy?'The Agent is processing a request. The active tool will be known when the backend returns its result.':'Run a request from Agent or Dispatch. This page reflects actual tool calls and backend records available to the shared operations session.'}</p>}
   {availableToolCalls.length>0&&<div className="execution-tool-calls"><span>Actual tool calls</span>{availableToolCalls.map((call,index)=><button key={`${call.name}-${index}`} onClick={()=>{const tool=tools.find(t=>t.name===call.name);if(tool)pickTool(tool)}}><Check size={12}/><code>{call.name}</code><small>{Object.keys(call.args).join(', ')||'no arguments'}</small></button>)}</div>}
   {!busy&&dispatchResult&&<div className="workflow-result-metrics"><span><b>{dispatchResult.metrics.orders_considered}</b> considered</span><span><b>{dispatchResult.metrics.orders_assigned}</b> assigned</span><span><b>{dispatchResult.metrics.drivers_used}</b> drivers</span><span><b>{dispatchResult.metrics.estimated_time_saved_minutes}</b> min saved</span></div>}
   {busy&&<div className="workflow-running-note"><LoaderCircle size={14} className="workflow-spin"/> Agent request in progress. The exact active tool is not exposed until the backend returns its tool-call result.</div>}
   {!latestRun&&activity.length>0&&<div className="workflow-persisted-activity"><span>Recent backend activity</span>{activity.slice(0,3).map(item=><span key={item.id}>{item.description}</span>)}</div>}
  </section>
 </div>
}
