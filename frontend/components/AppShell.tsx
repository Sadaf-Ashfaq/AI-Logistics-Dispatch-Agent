'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity as ActivityIcon, AlertTriangle, Bot, Boxes, ChartNoAxesCombined, ChevronRight, ClipboardList, Command, LayoutDashboard, Menu, Radio, Truck, Workflow, X } from 'lucide-react'
import { useState } from 'react'
import { OperationsProvider, useOperations } from './OperationsProvider'

const nav=[
 {href:'/',label:'Overview',icon:LayoutDashboard}, {href:'/orders',label:'Orders',icon:ClipboardList},
 {href:'/drivers',label:'Drivers',icon:Truck}, {href:'/dispatch',label:'Dispatch',icon:Boxes},
 {href:'/agent',label:'Agent',icon:Bot}, {href:'/workflow',label:'Agent Workflow',icon:Workflow}, {href:'/activity',label:'Activity',icon:ActivityIcon},
 {href:'/reports',label:'Reports',icon:ChartNoAxesCombined},
]
const titles:Record<string,{title:string,subtitle:string}>={
 '/':{title:'Operations Overview',subtitle:'AI-powered logistics control center'},'/orders':{title:'Orders',subtitle:'Manage and monitor today’s delivery requests'},
 '/drivers':{title:'Drivers',subtitle:'Monitor availability and delivery capacity'},'/dispatch':{title:'AI Dispatch Center',subtitle:'Review and manage optimized delivery plans'},
 '/agent':{title:'RouteFlow AI Agent',subtitle:'Autonomous logistics operations'},'/workflow':{title:'Agent Workflow',subtitle:'Visualize RouteFlow AI’s tools and execution path'},'/activity':{title:'Agent Activity',subtitle:'A clear audit trail of RouteFlow AI actions'},
 '/reports':{title:'Business Impact',subtitle:'Measure how AI improves daily dispatch operations'},
}
function ShellContent({children}:{children:React.ReactNode}){
 const path=usePathname(),{error,notice,clearNotice,loading}=useOperations();const [mobileOpen,setMobileOpen]=useState(false)
 const online=!loading&&!error
 const page=titles[path]??titles['/']
 return <div className="app-frame">
  <aside className={`sidebar ${mobileOpen?'sidebar-open':''}`}>
   <div className="side-brand"><div className="brand-symbol"><Command size={19}/></div><div><strong>ROUTEFLOW</strong><span>AI OPERATIONS</span></div><button className="mobile-close" onClick={()=>setMobileOpen(false)} aria-label="Close navigation"><X size={18}/></button></div>
   <div className="workspace-label">WORKSPACE</div>
   <nav className="main-nav">{nav.map(({href,label,icon:Icon})=><Link key={href} href={href} onClick={()=>setMobileOpen(false)} className={`nav-item ${path===href?'nav-active':''}`}><Icon size={17} strokeWidth={1.8}/><span>{label}</span>{path===href&&<ChevronRight size={14} className="nav-chevron"/>}</Link>)}</nav>
   <div className="sidebar-bottom"><div className="system-card"><div className="system-icon"><Radio size={16}/></div><div><strong>System status</strong><span><i className={`online-dot ${online?'':'offline-dot'}`}/>{loading?'Connecting…':online?'Agent online':'Backend offline'}</span></div><span className={`status-pip ${online?'':'offline-dot'}`}/></div><div className="side-foot">ROUTEFLOW AI <span>·</span> DISPATCH OS</div></div>
  </aside>
  {mobileOpen&&<button className="mobile-shade" onClick={()=>setMobileOpen(false)} aria-label="Close menu"/>}
  <section className="main-frame"><header className="app-header"><button className="mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="header-title"><h1>{page.title}</h1><p>{page.subtitle}</p></div><div className="header-right"><div className="header-date"><span>TODAY</span><strong>{new Date().toLocaleDateString('en-GB',{weekday:'short',day:'2-digit',month:'short'})}</strong></div><div className="header-divider"/><div className="header-status"><i className={`online-dot ${online?'':'offline-dot'}`}/><div><strong>RouteFlow AI</strong><span>{loading?'Checking':online?'Online':'Offline'}</span></div></div><div className="operator-avatar">OP</div></div></header>
   {error&&<div className="global-error"><AlertTriangle size={17}/><div><strong>{error.startsWith('Unable to connect')?'Unable to connect to RouteFlow AI.':'Operation could not be completed.'}</strong><span>{error.startsWith('Unable to connect')?error.replace('Unable to connect to RouteFlow AI. ',''):error}</span></div></div>}
   {notice&&<button className="toast" onClick={clearNotice}><span>✓</span>{notice}<X size={14}/></button>}
   <main className="page-area">{children}</main>
  </section>
 </div>
}
export default function AppShell({children}:{children:React.ReactNode}){return <OperationsProvider><ShellContent>{children}</ShellContent></OperationsProvider>}
