'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getData, postData } from '../lib/api'
import type { Activity, AgentResult, AgentRun, Assignment, DispatchResult, Driver, Order, Summary } from '../lib/types'

type ContextValue = {
  orders:Order[]; drivers:Driver[]; summary:Summary|null; activity:Activity[]; assignments:Assignment[]
  loading:boolean; error:string; busy:boolean; lastDispatch:DispatchResult|null; history:AgentRun[]; notice:string
  currentAgentRun:AgentRun|null
  refresh:()=>Promise<void>; runDispatch:()=>Promise<DispatchResult>; ask:(message:string)=>Promise<AgentRun>
  createOrder:(order:Omit<Order,'id'|'driver_name'|'assigned_driver_id'|'estimated_delivery_time'|'status'>)=>Promise<Order>
  createDriver:(driver:Omit<Driver,'id'|'deliveries_today'>)=>Promise<Driver>
  updateStatus:(orderId:number,status:string)=>Promise<boolean>; assignOrder:(orderId:number,driverId:number)=>Promise<boolean>; clearNotice:()=>void
}
const OperationsContext=createContext<ContextValue|null>(null)
export function OperationsProvider({children}:{children:React.ReactNode}){
 const [orders,setOrders]=useState<Order[]>([]),[drivers,setDrivers]=useState<Driver[]>([]),[summary,setSummary]=useState<Summary|null>(null)
 const [activity,setActivity]=useState<Activity[]>([]),[assignments,setAssignments]=useState<Assignment[]>([])
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[lastDispatch,setLastDispatch]=useState<DispatchResult|null>(null)
 const [history,setHistory]=useState<AgentRun[]>([]),[notice,setNotice]=useState('')
 const [currentAgentRun,setCurrentAgentRun]=useState<AgentRun|null>(null)
 const refresh=useCallback(async()=>{
   try{const [o,d,s,a,p,latest]=await Promise.all([getData<Order[]>('/orders'),getData<Driver[]>('/drivers'),getData<Summary>('/operations/summary'),getData<Activity[]>('/operations/activity'),getData<Assignment[]>('/operations/assignments'),getData<DispatchResult|null>('/operations/latest-dispatch')]);setOrders(o);setDrivers(d);setSummary(s);setActivity(a);setAssignments(p);setLastDispatch(latest);setError('')}
   catch{setError('Unable to connect to RouteFlow AI. Check that the FastAPI backend is running on port 8000.')}
   finally{setLoading(false)}
 },[])
 useEffect(()=>{void refresh()},[refresh])
 const runDispatch=useCallback(async()=>{
   setBusy(true);setError('')
    try{const result=await postData<DispatchResult>('/agent/dispatch');if(result.status!=='no_work')setLastDispatch(result);const run:AgentRun={id:Date.now(),request:'Plan today’s deliveries',completedAt:new Date().toISOString(),dispatch:result,result:{response:result.summary,actions:result.actions,tool_calls:[{name:'get_pending_orders'},{name:'get_available_drivers'},{name:'run_dispatch',result}],updated_orders:result.assignments}};setCurrentAgentRun(run);setHistory(prev=>[run,...prev]);await refresh();setNotice(result.summary);return result}
   catch(e){setError('Dispatch could not be completed. Check the backend connection and try again.');throw e}
   finally{setBusy(false)}
 },[refresh])
 const ask=useCallback(async(message:string)=>{
   setBusy(true);setError('')
   try{const result=await postData<AgentResult>('/agent/chat',{message});const run:AgentRun={id:Date.now(),request:message,result,completedAt:new Date().toISOString()};setCurrentAgentRun(run);setHistory(prev=>[run,...prev]);await refresh();setNotice('RouteFlow AI completed the request');return run}
   catch(e){setError('RouteFlow AI could not complete that request. Check the backend connection and try again.');throw e}
   finally{setBusy(false)}
 },[refresh])
 const createOrder=useCallback(async(order:Omit<Order,'id'|'driver_name'|'assigned_driver_id'|'estimated_delivery_time'|'status'>)=>{try{const created=await postData<Order>('/orders',order);await refresh();setNotice(`Order #${created.id} added to the operations queue`);return created}catch(e){setError('The order could not be saved. Check the details and try again.');throw e}},[refresh])
 const createDriver=useCallback(async(driver:Omit<Driver,'id'|'deliveries_today'>)=>{try{const created=await postData<Driver>('/drivers',driver);await refresh();setNotice(`${created.name} added to the driver roster`);return created}catch(e){setError('The driver could not be saved. Check the details and try again.');throw e}},[refresh])
 const updateStatus=useCallback(async(orderId:number,status:string)=>{try{await postData(`/orders/${orderId}/status`,{status});await refresh();setNotice(`Order #${orderId} marked ${status.replace('_',' ')}`);return true}catch{setError('The order status could not be updated. Please try again.');return false}},[refresh])
 const assignOrder=useCallback(async(orderId:number,driverId:number)=>{try{await postData(`/orders/${orderId}/assign`,{driver_id:driverId});await refresh();setNotice(`Order #${orderId} assigned successfully`);return true}catch{setError('The order could not be assigned. Check driver availability.');return false}},[refresh])
 const clearNotice=useCallback(()=>setNotice(''),[])
 useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),3800);return()=>clearTimeout(id)},[notice])
 const value=useMemo(()=>({orders,drivers,summary,activity,assignments,loading,error,busy,lastDispatch,history,notice,currentAgentRun,refresh,runDispatch,ask,createOrder,createDriver,updateStatus,assignOrder,clearNotice}),[orders,drivers,summary,activity,assignments,loading,error,busy,lastDispatch,history,notice,currentAgentRun,refresh,runDispatch,ask,createOrder,createDriver,updateStatus,assignOrder,clearNotice])
 return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>
}
export function useOperations(){const value=useContext(OperationsContext);if(!value)throw new Error('useOperations must be used inside OperationsProvider');return value}
