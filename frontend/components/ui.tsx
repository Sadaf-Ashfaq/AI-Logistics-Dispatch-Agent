import Link from 'next/link'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, CircleAlert, Clock3, LoaderCircle, type LucideIcon } from 'lucide-react'

export function PageIntro({eyebrow,title,description,action}:{eyebrow?:string;title:string;description?:string;action?:React.ReactNode}){
 return <div className="page-intro"><div>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2>{description&&<p>{description}</p>}</div>{action&&<div className="intro-action">{action}</div>}</div>
}
export function PanelTitle({title,subtitle,action}:{title:string;subtitle?:string;action?:React.ReactNode}){
 return <div className="panel-title"><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div>{action&&<div>{action}</div>}</div>
}
export function KpiCard({label,value,detail,icon:Icon,tone='blue',trend}:{label:string;value:React.ReactNode;detail:string;icon:LucideIcon;tone?:string;trend?:'up'|'down'|'neutral'}){
 const Trend=trend==='down'?ArrowDownRight:ArrowUpRight
 return <article className="kpi-card"><div className={`kpi-icon tone-${tone}`}><Icon size={17} strokeWidth={1.9}/></div><div className="kpi-value">{value}</div><div className="kpi-label">{label}</div><div className="kpi-detail">{trend&&<Trend size={13} className={trend==='down'?'trend-down':'trend-up'}/>}<span>{detail}</span></div></article>
}
export function Badge({children,tone='neutral',className=''}:{children:React.ReactNode;tone?:string;className?:string}){return <span className={`badge badge-${tone} ${className}`}>{children}</span>}
export function PriorityBadge({priority}:{priority:string}){return <Badge tone={priority==='urgent'?'red':priority==='high'?'amber':priority==='low'?'green':'blue'}>{priority.toUpperCase()}</Badge>}
export function StatusBadge({status}:{status:string}){const tone=status==='delivered'||status==='available'?'green':status==='delayed'||status==='failed'?'red':status==='in_transit'||status==='assigned'?'blue':status==='busy'?'amber':status==='offline'?'neutral':'amber';return <Badge tone={tone} className="status-badge"><span className="badge-dot"/>{status.replace('_',' ')}</Badge>}
export function EmptyState({title,description,icon:Icon=CircleAlert,action}:{title:string;description?:string;icon?:LucideIcon;action?:React.ReactNode}){
 return <div className="empty-state"><div className="empty-icon"><Icon size={21}/></div><strong>{title}</strong>{description&&<p>{description}</p>}{action}</div>
}
export function Loading({label='Loading operations data…'}:{label?:string}){return <div className="loading-line"><LoaderCircle size={16} className="spin"/><span>{label}</span></div>}
export function ErrorBlock({retry}:{retry:()=>void}){return <div className="inline-error"><CircleAlert size={17}/><span>We couldn’t load this information.</span><button onClick={retry}>Try again <ArrowRight size={14}/></button></div>}
export function RelativeTime({value}:{value:string}){const when=new Date(value.endsWith('Z')?value:`${value}Z`);const minutes=Math.max(0,Math.floor((Date.now()-when.getTime())/60000));return <span>{minutes<1?'Just now':minutes<60?`${minutes} min ago`:`${Math.floor(minutes/60)} hr ago`}</span>}
export function LinkButton({href,children}:{href:string;children:React.ReactNode}){return <Link className="text-link" href={href}>{children}<ArrowRight size={14}/></Link>}
export function TimeSaved({minutes}:{minutes:number}){const hours=Math.floor(minutes/60),mins=minutes%60;return hours?`${hours}h ${mins}m`:`${mins} min`}
export function AgentDot(){return <span className="agent-dot"><Check size={11}/></span>}
export function MutedTime({value}:{value:string}){return <span className="muted-time"><Clock3 size={12}/>{value}</span>}
