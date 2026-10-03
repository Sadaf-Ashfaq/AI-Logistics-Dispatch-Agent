'use client'
import { useMemo } from 'react'
import { Activity, AlertOctagon, ArrowRight, Boxes, Clock3, Route, Timer, Truck, Users, Waypoints, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useOperations } from '../OperationsProvider'
import { Badge, EmptyState, KpiCard, Loading, PageIntro, PanelTitle, PriorityBadge, RelativeTime, StatusBadge, TimeSaved } from '../ui'

export default function OverviewPage(){
 const {orders,drivers,summary,activity,lastDispatch,busy,loading,runDispatch}=useOperations(),router=useRouter()
 const today=new Date().toLocaleDateString('en-CA');const todays=useMemo(()=>orders.filter(o=>o.requested_date===today),[orders,today])
 const total=todays.length||summary?.total_orders_today||0
 const delivered=todays.filter(o=>o.status==='delivered').length,track=todays.filter(o=>['assigned','in_transit'].includes(o.status)).length
 const pending=todays.filter(o=>o.status==='pending').length,lateToday=todays.filter(o=>['delayed','failed'].includes(o.status)).length
 const health=[{label:'On track',value:track,color:'green'},{label:'Delayed / failed',value:lateToday,color:'red'},{label:'Pending',value:pending,color:'amber'},{label:'Delivered',value:delivered,color:'blue'}]
 const recent=activity.slice(0,5),lastRun=activity.find(a=>a.action_type==='dispatch')
 const considered=lastDispatch?.metrics.orders_considered??total,assigned=lastDispatch?.metrics.orders_assigned??summary?.orders_assigned??0
 const exceptions=lastDispatch?lastDispatch.metrics.orders_considered-lastDispatch.metrics.orders_assigned:summary?.pending_orders??0
 const greeting=new Date().getHours()<12?'Good morning':new Date().getHours()<17?'Good afternoon':'Good evening'
 return <div className="page-stack">
  <PageIntro eyebrow="CAIRO · DISPATCH CENTER" title={`${greeting}, Dispatcher`} description="Here’s what RouteFlow AI sees across today’s delivery operations." action={<button className="button button-primary" disabled={busy} onClick={()=>void runDispatch().catch(()=>{})}><Zap size={16}/>{busy?'Running dispatch…':'Run AI Dispatch'}<ArrowRight size={15}/></button>}/>
  {loading?<div className="loading-surface"><Loading label="Connecting to live operations…"/></div>:<>
  <section className="kpi-grid">
   <KpiCard icon={Boxes} label="Today’s orders" value={summary?.total_orders_today??total} detail="in today’s delivery queue" tone="blue"/>
   <KpiCard icon={Clock3} label="Pending" value={summary?.pending_orders??pending} detail="awaiting assignment" tone="amber"/>
   <KpiCard icon={AlertOctagon} label="Urgent" value={summary?.urgent_orders??0} detail="open priority deliveries" tone="red"/>
   <KpiCard icon={Users} label="Available drivers" value={summary?.available_drivers??drivers.filter(d=>d.status==='available').length} detail={`${drivers.length} drivers in the fleet`} tone="green"/>
   <KpiCard icon={Timer} label="Time saved" value={<>{summary?.estimated_time_saved_hours??0}<small className="value-unit"> hrs</small></>} detail="estimated from dispatch work" tone="indigo"/>
  </section>
  <div className="overview-grid">
   <section className="surface-card health-card"><PanelTitle title="Delivery health" subtitle={`${total} orders currently in today’s operation`}/><div className="health-list">{health.map(item=><div className="health-row" key={item.label}><div className="health-label"><span className={`health-dot ${item.color}`}/><span>{item.label}</span><strong>{item.value}</strong></div><div className="health-track"><i className={item.color} style={{width:`${total?Math.min(100,item.value/total*100):0}%`}}/></div></div>)}</div><div className="health-foot"><span><Waypoints size={15}/> Fleet utilization</span><strong>{summary?.driver_utilization??0}%</strong></div></section>
   <section className="surface-card dispatch-status-card"><PanelTitle title="AI dispatch status" subtitle="Latest operational plan" action={<span className="soft-status"><i/>{lastRun?'COMPLETED':'READY'}</span>}/>
    <div className="dispatch-last"><div className="dispatch-spark"><Route size={19}/></div><div><strong>{lastRun?'Dispatch plan created':'No dispatch run yet'}</strong><span>{lastRun?<RelativeTime value={lastRun.created_at}/>: 'Run the agent to create a live plan'}</span></div></div>
    <div className="dispatch-numbers"><div><span>{lastDispatch?'Orders processed':'Orders today'}</span><strong>{considered}</strong></div><div><span>Orders assigned</span><strong>{assigned}</strong></div><div><span>Exceptions</span><strong className={exceptions?'text-amber':''}>{exceptions}</strong></div></div>
    {busy&&<div className="working-line"><span className="spinner-dark"/> RouteFlow AI is reviewing live orders and driver capacity…</div>}
    <button className="button button-primary dispatch-wide" disabled={busy} onClick={()=>void runDispatch().catch(()=>{})}><Zap size={15}/>{busy?'Dispatch in progress':'Run AI Dispatch'}<ArrowRight size={15}/></button>
   </section>
  </div>
  <section className="surface-card recent-card"><PanelTitle title="Recent agent activity" subtitle="The latest actions RouteFlow AI recorded" action={<button className="button button-quiet" onClick={()=>router.push('/activity')}>View all activity <ArrowRight size={14}/></button>}/>
   {!recent.length?<EmptyState title="No agent runs yet" description="Run a dispatch task to see RouteFlow AI’s actions here." icon={Activity}/>:<div className="recent-list">{recent.map(a=><div className="recent-row" key={a.id}><div className={`activity-symbol ${a.action_type}`}><Activity size={15}/></div><div className="recent-copy"><strong>{a.description}</strong><span><RelativeTime value={a.created_at}/><i>·</i>RouteFlow AI</span></div>{a.action_type==='assignment'?<Badge tone="green">ACTION</Badge>:a.action_type==='dispatch'?<Badge tone="blue">RESULT</Badge>:<Badge tone="neutral">TOOL</Badge>}</div>)}</div>}
  </section>
  </>}
 </div>
}
