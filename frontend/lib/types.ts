export type Order = {
  id: number; customer_name: string; phone: string; pickup_zone: string; delivery_zone: string
  delivery_address: string; package_type: string; package_weight: number; priority: string
  status: string; requested_date: string; promised_time: string; assigned_driver_id: number | null
  driver_name: string | null; estimated_delivery_time: number | null
}
export type Driver = {
  id: number; name: string; phone: string; vehicle_type: string; vehicle_capacity: number
  current_zone: string; availability: string; max_daily_deliveries: number; deliveries_today: number; status: string
}
export type Summary = {
  total_orders_today: number; pending_orders: number; urgent_orders: number; available_drivers: number
  orders_assigned: number; late_orders: number; estimated_manual_minutes: number; estimated_agent_minutes: number
  estimated_time_saved_minutes: number; estimated_time_saved_hours: number; driver_utilization: number
}
export type Activity = { id: number; action_type: string; description: string; entity_type: string; entity_id: number | null; created_at: string }
export type Assignment = {
  id: number; order_id: number; driver_id: number; driver_name: string; vehicle_type: string
  current_zone: string; zone: string; sequence: number; estimated_minutes: number; status: string
}
export type DispatchResult = {
  status?: 'completed' | 'already_up_to_date' | 'no_work'; already_processed?: boolean; dispatched_at?: string | null
  summary: string; assignments: Array<{id?:number;order_id:number;driver_id:number;driver_name:string;zone:string;minutes:number;priority:string;sequence?:number;status?:string}>
  metrics: { orders_considered:number;orders_assigned:number;drivers_used:number;urgent_handled:number;estimated_manual_minutes:number;estimated_agent_minutes:number;estimated_time_saved_minutes:number;estimated_time_saved_hours:number }
  actions: string[]
}
export type AgentResult = { response:string; actions:string[]; tool_calls:Array<{name:string;arguments?:Record<string,unknown>;result?:unknown}>; updated_orders:unknown[] }
export type AgentRun = { id:number; request:string; result:AgentResult; completedAt:string; dispatch?:DispatchResult }
export type AgentTool = { name:string; description:string; parameters:Record<string,{type:string;description?:string}>; required:string[] }
