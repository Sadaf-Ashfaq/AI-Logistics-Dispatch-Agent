"""Database-backed logistics tools and concise operational responses."""
import json, os, re
from datetime import date, datetime, time
import httpx
from sqlalchemy.orm import Session
from ..models import Order, Driver, AgentAction, DeliveryAssignment, DispatchRun
from ..services.route_service import estimate_route
from ..services.dispatch_service import assign, log, run_dispatch

def _tool(name, description, properties=None, required=None):
    return {"type":"function","function":{"name":name,"description":description,"parameters":{"type":"object","properties":properties or {},"required":required or []}}}

TOOLS = [
 _tool("get_pending_orders","Read today's pending and delayed orders"),
 _tool("get_today_orders","Read all of today's orders and statuses"),
 _tool("get_available_drivers","Read available drivers and remaining capacity"),
 _tool("get_urgent_orders","Read urgent orders that are not delivered or failed"),
 _tool("get_at_risk_deliveries","Find delayed, failed, and past-promise open deliveries"),
 _tool("get_dispatch_plan","Read today's saved delivery assignments and sequence"),
 _tool("get_driver_workloads","Count today's actual assignments per driver"),
 _tool("get_dispatch_metrics","Read the latest persisted dispatch time metrics"),
 _tool("get_operations_summary","Read today's operations summary"),
 _tool("get_order_details","Read an order", {"order_id":{"type":"integer"}}, ["order_id"]),
 _tool("explain_assignment","Read assignment facts for an order", {"order_id":{"type":"integer"}}, ["order_id"]),
 _tool("calculate_driver_capacity","Read remaining stops and package capacity", {"driver_id":{"type":"integer"}}, ["driver_id"]),
 _tool("estimate_route","Estimate route minutes", {"from_zone":{"type":"string"},"to_zone":{"type":"string"}}, ["from_zone","to_zone"]),
 _tool("assign_order_to_driver","Assign one eligible unassigned order", {"order_id":{"type":"integer"},"driver_id":{"type":"integer"}}, ["order_id","driver_id"]),
 _tool("reassign_delayed_orders","Reassign today's delayed orders to another eligible driver"),
 _tool("run_dispatch","Dispatch today's eligible orders using existing business rules"),
]

def _today_open(db):
    return db.query(Order).filter(Order.requested_date==date.today().isoformat(),Order.status.in_(["pending","delayed"]),Order.assigned_driver_id.is_(None)).order_by(Order.id).all()

def _available(db):
    return db.query(Driver).filter(Driver.status=="available",Driver.availability=="available").order_by(Driver.id).all()

def _time_metrics(db):
    run=db.query(DispatchRun).order_by(DispatchRun.created_at.desc(),DispatchRun.id.desc()).first()
    if run:
        return {"source":"latest_dispatch","orders_considered":run.orders_considered,"orders_assigned":run.orders_assigned,"estimated_manual_minutes":run.estimated_manual_minutes,"estimated_agent_minutes":run.estimated_agent_minutes,"estimated_time_saved_minutes":run.estimated_time_saved_minutes}
    pending=_today_open(db); drivers=_available(db)
    capacity=sum(max(0,d.max_daily_deliveries-d.deliveries_today) for d in drivers)
    manual=len(pending)*20; agent=5+max(0,len(pending)-capacity)
    return {"source":"current_queue_estimate","orders_considered":len(pending),"orders_assigned":0,"estimated_manual_minutes":manual,"estimated_agent_minutes":agent,"estimated_time_saved_minutes":max(0,manual-agent)}

def _risk_orders(db):
    now=datetime.now(); rows=db.query(Order).filter(Order.status.in_(["pending","assigned","in_transit","delayed","failed"])).all(); result=[]
    for o in rows:
        reason=None
        if o.status=="delayed": reason="Status is delayed"
        elif o.status=="failed": reason="Status is failed"
        else:
            try:
                due=datetime.combine(date.fromisoformat(o.requested_date),time.fromisoformat(o.promised_time))
                if due < now: reason=f"Promised time {o.requested_date} {o.promised_time} has passed while the order remains {o.status}"
            except ValueError: pass
        if reason: result.append({"id":o.id,"customer":o.customer_name,"priority":o.priority,"status":o.status,"pickup_zone":o.pickup_zone,"delivery_zone":o.delivery_zone,"driver":o.driver.name if o.driver else None,"reason":reason})
    return result

def execute(name, args, db):
    today=date.today().isoformat()
    if name=="get_pending_orders":
        rows=_today_open(db); result=[{"id":o.id,"zone":o.delivery_zone,"priority":o.priority,"status":o.status,"promise":o.promised_time} for o in rows]
        log(db,"tool",f"Retrieved {len(rows)} unassigned dispatchable orders","system"); db.commit(); return result
    if name=="get_today_orders":
        rows=db.query(Order).filter_by(requested_date=today).order_by(Order.id).all(); result=[{"id":o.id,"customer":o.customer_name,"zone":o.delivery_zone,"priority":o.priority,"status":o.status,"driver_id":o.assigned_driver_id,"promised_time":o.promised_time} for o in rows]
        log(db,"tool",f"Retrieved {len(rows)} orders for today","system"); db.commit(); return result
    if name=="get_available_drivers":
        rows=_available(db); result=[{"id":d.id,"name":d.name,"zone":d.current_zone,"remaining_stops":max(0,d.max_daily_deliveries-d.deliveries_today),"max_daily_deliveries":d.max_daily_deliveries,"deliveries_today":d.deliveries_today,"max_package_weight":d.vehicle_capacity} for d in rows]
        log(db,"tool",f"Checked driver availability; {len(rows)} drivers currently available","system"); db.commit(); return result
    if name=="get_urgent_orders":
        rows=db.query(Order).filter(Order.priority=="urgent",Order.status.notin_(["delivered","failed"])).order_by(Order.requested_date,Order.id).all()
        result=[{"id":o.id,"customer":o.customer_name,"status":o.status,"zone":o.delivery_zone,"requested_date":o.requested_date,"promised_time":o.promised_time,"driver":o.driver.name if o.driver else None} for o in rows]
        log(db,"tool",f"Retrieved {len(rows)} open urgent orders","system"); db.commit(); return result
    if name=="get_at_risk_deliveries":
        result=_risk_orders(db); log(db,"tool",f"Checked delivery risk; {len(result)} orders are delayed, failed, or past promise","system"); db.commit(); return result
    if name=="reassign_delayed_orders":
        rows=db.query(Order).filter(Order.requested_date==today,Order.status=="delayed").order_by(Order.id).all(); changed=[]; skipped=[]
        for order in rows:
            previous=db.get(Driver,order.assigned_driver_id) if order.assigned_driver_id else None
            candidates=[d for d in _available(db) if (previous is None or d.id!=previous.id) and d.deliveries_today<d.max_daily_deliveries and d.vehicle_capacity>=order.package_weight]
            if not candidates:
                skipped.append({"order_id":order.id,"reason":"No alternate available driver has remaining stop and package capacity."}); continue
            driver=min(candidates,key=lambda d:(d.deliveries_today/max(d.max_daily_deliveries,1),estimate_route(d.current_zone,order.delivery_zone)))
            if previous:
                old=db.query(DeliveryAssignment).filter_by(order_id=order.id,driver_id=previous.id).order_by(DeliveryAssignment.sequence.desc()).first()
                if old: old.status="reassigned"
                previous.deliveries_today=max(0,previous.deliveries_today-1)
                if previous.status=="busy" and previous.availability=="available" and previous.deliveries_today<previous.max_daily_deliveries: previous.status="available"
                order.assigned_driver_id=None
            sequence=db.query(DeliveryAssignment).filter_by(driver_id=driver.id).count()+1
            item=assign(db,order,driver,sequence); driver.current_zone=order.delivery_zone
            if driver.deliveries_today>=driver.max_daily_deliveries: driver.status="busy"
            changed.append(item)
            log(db,"reassignment",f"Reassigned delayed Order #{order.id} to {driver.name}","order",order.id)
        db.commit()
        return {"orders_found":len(rows),"orders_reassigned":len(changed),"assignments":changed,"skipped":skipped}
    if name=="get_dispatch_plan":
        rows=db.query(DeliveryAssignment).join(DeliveryAssignment.order).filter(Order.requested_date==today).order_by(DeliveryAssignment.driver_id,DeliveryAssignment.sequence).all()
        result=[{"order_id":a.order_id,"driver_id":a.driver_id,"driver":a.driver.name,"sequence":a.sequence,"delivery_zone":a.order.delivery_zone,"status":a.order.status,"priority":a.order.priority,"estimated_minutes":a.estimated_minutes} for a in rows]
        log(db,"tool",f"Retrieved {len(rows)} saved delivery assignments for today's plan","system"); db.commit(); return result
    if name=="get_driver_workloads":
        counts={d.id:0 for d in db.query(Driver).all()}
        rows=db.query(DeliveryAssignment).join(DeliveryAssignment.order).filter(Order.requested_date==today).all()
        for a in rows: counts[a.driver_id]=counts.get(a.driver_id,0)+1
        result=[{"driver_id":d.id,"driver":d.name,"assignments":counts.get(d.id,0)} for d in db.query(Driver).order_by(Driver.id).all()]
        log(db,"tool","Counted today's assignments per driver","system"); db.commit(); return result
    if name=="get_dispatch_metrics":
        result=_time_metrics(db); log(db,"tool","Retrieved persisted dispatch time metrics","system"); db.commit(); return result
    if name=="get_operations_summary":
        orders=db.query(Order).filter_by(requested_date=today).all(); drivers=db.query(Driver).all(); metrics=_time_metrics(db)
        result={"total_orders":len(orders),"pending_orders":sum(o.status in ("pending","delayed") and o.assigned_driver_id is None for o in orders),"urgent_orders":sum(o.priority=="urgent" and o.status not in ("delivered","failed") for o in orders),"assigned_orders":sum(o.assigned_driver_id is not None for o in orders),"available_drivers":sum(d.status=="available" and d.availability=="available" for d in drivers),"delayed_failed_orders":db.query(Order).filter(Order.status.in_(["delayed","failed"])).count(),"estimated_time_saved_minutes":metrics["estimated_time_saved_minutes"]}
        log(db,"tool","Generated today's database-backed operations summary","system"); db.commit(); return result
    if name in ("get_order_details","explain_assignment"):
        order=db.get(Order,args["order_id"])
        if not order: return {"error":"Order not found"}
        assignments=db.query(DeliveryAssignment).filter_by(order_id=order.id).order_by(DeliveryAssignment.sequence.desc()).all()
        driver=order.driver
        result={"id":order.id,"customer":order.customer_name,"status":order.status,"priority":order.priority,"pickup_zone":order.pickup_zone,"delivery_zone":order.delivery_zone,"promised_time":order.promised_time,"driver_id":driver.id if driver else None,"driver":driver.name if driver else None,"driver_remaining_stops":max(0,driver.max_daily_deliveries-driver.deliveries_today) if driver else None,"driver_package_capacity":driver.vehicle_capacity if driver else None,"route_estimate_minutes":estimate_route(order.pickup_zone,order.delivery_zone) if driver else None,"assignment_sequence":assignments[0].sequence if assignments else None,"assignment_rationale_stored":False}
        log(db,"tool",f"Read order #{order.id} details and assignment facts","system"); db.commit(); return result
    if name=="calculate_driver_capacity":
        driver=db.get(Driver,args["driver_id"])
        if not driver: return {"error":"Driver not found"}
        return {"driver_id":driver.id,"driver_name":driver.name,"remaining_stops":max(0,driver.max_daily_deliveries-driver.deliveries_today),"max_package_weight":driver.vehicle_capacity,"availability":driver.availability,"status":driver.status}
    if name=="estimate_route": return {"estimated_minutes":estimate_route(args["from_zone"],args["to_zone"])}
    if name=="assign_order_to_driver":
        order,driver=db.get(Order,args["order_id"]),db.get(Driver,args["driver_id"])
        if not order or not driver: return {"error":"Order or driver not found"}
        if order.requested_date!=today or order.status not in ("pending","delayed") or order.assigned_driver_id is not None: return {"error":"Order is not an unassigned dispatchable order for today"}
        if driver.status!="available" or driver.availability!="available" or driver.deliveries_today>=driver.max_daily_deliveries or driver.vehicle_capacity<order.package_weight: return {"error":"Driver is unavailable or lacks remaining stop/package capacity"}
        seq=db.query(DeliveryAssignment).filter_by(driver_id=driver.id).count()+1
        result=assign(db,order,driver,seq); driver.current_zone=order.delivery_zone
        if driver.deliveries_today>=driver.max_daily_deliveries: driver.status="busy"
        db.commit(); return result
    if name=="run_dispatch": return run_dispatch(db)
    raise ValueError(f"Unsupported tool: {name}")

def _run_tools(names, db):
    calls=[]
    for name in names:
        args={}; result=execute(name,args,db); calls.append({"name":name,"arguments":args,"result":result})
    return calls

def _response(message, db):
    text=message.lower().strip(); calls=[]; updated=[]; actions=[]
    def call(name,args=None):
        args=args or {}; result=execute(name,args,db); calls.append({"name":name,"arguments":args,"result":result}); return result
    def done(answer): return {"response":answer,"tool_calls":calls,"actions":actions,"updated_orders":updated}
    if ("dispatch plan" in text and any(w in text for w in ("show","view","what","today"))) or "show today's plan" in text:
        rows=call("get_dispatch_plan")
        if not rows: return done("There are no saved assignments in today’s dispatch plan yet.")
        body="\n".join(f"Order #{r['order_id']} — {r['driver']} (Driver {r['driver_id']}), stop {r['sequence']}; delivery zone {r['delivery_zone']}; {r['priority']}, {r['status']}; {r['estimated_minutes']} min estimated" for r in rows)
        return done(f"Today's saved dispatch plan ({len(rows)} assignments):\n{body}")
    if re.search(r"why.*order\s*#?\s*\d+.*assign|order\s*#?\s*\d+.*why",text):
        match=re.search(r"order\s*#?\s*(\d+)",text); row=call("explain_assignment",{"order_id":int(match.group(1))})
        if row.get("error"): return done(row["error"])
        if not row["driver"]: return done(f"Order #{row['id']} is {row['status']} and has no assigned driver.")
        return done(f"Order #{row['id']} is assigned to {row['driver']} (Driver {row['driver_id']}). Current facts: {row['pickup_zone']} → {row['delivery_zone']}, estimated route {row['route_estimate_minutes']} min; driver's current remaining daily stops {row['driver_remaining_stops']}, package capacity {row['driver_package_capacity']} kg; recorded stop {row['assignment_sequence']}. The original assignment rationale was not stored, so I can't confirm why that driver was selected.")
    if any(x in text for x in ("how much time","time saved","dispatcher time")):
        row=call("get_dispatch_metrics")
        label="Latest dispatch" if row["source"]=="latest_dispatch" else "Current queue estimate (no dispatch run recorded yet)"
        return done(f"{label} saved an estimated {row['estimated_time_saved_minutes']} minutes ({row['estimated_time_saved_minutes']/60:.2f} hours) of dispatcher time ({row['estimated_manual_minutes']} min manual vs {row['estimated_agent_minutes']} min agent-assisted).")
    if "most available capacity" in text or "most capacity" in text or "highest capacity" in text:
        rows=call("get_available_drivers")
        if not rows: return done("There are no currently available drivers.")
        best=max(rows,key=lambda d:d["remaining_stops"])
        return done(f"{best['name']} (Driver {best['id']}) has the most remaining daily stops: {best['remaining_stops']} of {best['max_daily_deliveries']} (already recorded today: {best['deliveries_today']}); vehicle package capacity {best['max_package_weight']} kg.")
    if "driver" in text and "available" in text:
        rows=call("get_available_drivers")
        if not rows: return done("No drivers currently meet the available status and availability checks.")
        lines="\n".join(f"• {d['name']} (Driver {d['id']}) — {d['remaining_stops']} stops remaining; {d['max_package_weight']} kg vehicle capacity; zone {d['zone']}" for d in rows)
        return done(f"{len(rows)} drivers are currently available:\n{lines}")
    if "urgent" in text and not any(x in text for x in ("prioritize", "dispatch", "assign")):
        rows=call("get_urgent_orders")
        if not rows: return done("There are no open urgent orders.")
        lines="\n".join(f"• Order #{o['id']} — {o['customer']} — {o['status']}; {o['zone']}; promised {o['requested_date']} {o['promised_time']}"+(f"; driver {o['driver']}" if o['driver'] else "; unassigned") for o in rows)
        return done(f"{len(rows)} open urgent orders:\n{lines}")
    if any(x in text for x in ("risk","late","overdue")):
        rows=call("get_at_risk_deliveries")
        if not rows: return done("No orders are currently delayed, failed, or past their promised delivery time.")
        lines="\n".join(f"Order #{o['id']} — {o['priority']}; {o['status']}; {o['pickup_zone']} → {o['delivery_zone']}; {o['reason']}"+(f"; driver {o['driver']}" if o['driver'] else "") for o in rows[:8])
        more=f"\n…and {len(rows)-8} more." if len(rows)>8 else ""
        return done(f"{len(rows)} deliveries meet the current risk checks:\n{lines}{more}")
    if "assigned to each driver" in text or "per driver" in text or "each driver" in text:
        rows=call("get_driver_workloads")
        return done("Today's saved assignment counts by driver:\n"+"\n".join(f"• {r['driver']}: {r['assignments']}" for r in rows))
    if "pending" in text and not any(x in text for x in ("assign", "dispatch", "plan")):
        rows=call("get_pending_orders")
        if "how many" in text or "count" in text: return done(f"There are {len(rows)} unassigned pending or delayed orders eligible for today's dispatch.")
        lines="\n".join(f"• Order #{o['id']} — {o['priority']}; {o['status']}; {o['zone']}; promised {o['promise']}" for o in rows)
        return done(f"{len(rows)} unassigned orders are eligible for today's dispatch:\n{lines}" if rows else "There are no unassigned pending or delayed orders eligible for today's dispatch.")
    if "summary" in text or "operations" in text:
        row=call("get_operations_summary")
        return done("Today's operations summary:\n"+f"• Orders: {row['total_orders']}\n• Pending/unassigned: {row['pending_orders']}\n• Open urgent: {row['urgent_orders']}\n• Assigned: {row['assigned_orders']}\n• Available drivers: {row['available_drivers']}\n• Delayed/failed: {row['delayed_failed_orders']}\n• Estimated time saved: {row['estimated_time_saved_minutes']} min")
    if any(x in text for x in ("plan", "dispatch", "assign pending", "optimiz", "prioritize", "reassign delayed")):
        if "reassign delayed" in text or "reassign" in text and "delay" in text:
            result=call("reassign_delayed_orders"); updated.extend(result["assignments"]); actions.extend([f"Reassigned Order #{a['order_id']} to {a['driver_name']}" for a in result["assignments"]])
            if result["orders_reassigned"]==0:
                return done(f"No delayed orders dated today were reassigned. {len(result['skipped'])} eligible order(s) were skipped because no alternate driver had enough capacity." if result["orders_found"] else "There are no delayed orders dated today to reassign. No database changes were made.")
            return done(f"Reassigned {result['orders_reassigned']} of {result['orders_found']} delayed orders to alternate drivers.")
        call("get_pending_orders"); call("get_available_drivers"); result=call("run_dispatch")
        updated.extend(result["assignments"]); actions.extend(result["actions"])
        m=result["metrics"]
        return done(f"{result['summary']}\nUrgent orders handled: {m['urgent_handled']}. Estimated time saved: {m['estimated_time_saved_minutes']} min ({m['estimated_manual_minutes']} min manual vs {m['estimated_agent_minutes']} min agent-assisted).")
    return None

def chat(message: str, db: Session):
    local=_response(message,db)
    if local is not None: return local
    provider,key,model=os.getenv("LLM_PROVIDER","").lower(),os.getenv("LLM_API_KEY"),os.getenv("LLM_MODEL")
    base=os.getenv("LLM_BASE_URL","https://api.openai.com/v1")
    if key and model and provider in ("openai","openai_compatible"):
        try:
            messages=[{"role":"system","content":"You are RouteFlow, a logistics operations agent. Use database tools before stating operational facts. Never infer unsupported assignment reasons or delivery risks. Answer directly, with order IDs and actual values from tool output. Run dispatch only for action requests."},{"role":"user","content":message}]; calls=[]; actions=[]; updated=[]
            for _ in range(5):
                res=httpx.post(base.rstrip("/")+"/chat/completions",headers={"Authorization":f"Bearer {key}"},json={"model":model,"messages":messages,"tools":TOOLS,"tool_choice":"auto"},timeout=35); res.raise_for_status(); choice=res.json()["choices"][0]["message"]; messages.append(choice)
                if not choice.get("tool_calls"): return {"response":choice.get("content") or "I could not form a response from the available data.","tool_calls":calls,"actions":actions,"updated_orders":updated}
                for tc in choice["tool_calls"]:
                    name=tc["function"]["name"]; args=json.loads(tc["function"].get("arguments") or "{}"); result=execute(name,args,db); calls.append({"name":name,"arguments":args,"result":result})
                    if name=="run_dispatch": actions.extend(result.get("actions",[])); updated.extend(result.get("assignments",[]))
                    messages.append({"role":"tool","tool_call_id":tc["id"],"content":json.dumps(result,ensure_ascii=False)})
        except Exception as exc:
            log(db,"fallback",f"LLM unavailable; used database-backed operational response ({type(exc).__name__})","system"); db.commit()
    result=call_result=execute("get_operations_summary",{},db)
    return {"response":f"I can answer questions about live orders, drivers, dispatch plans, assignments, delivery risk, and time saved. Current snapshot: {result['total_orders']} orders today, {result['pending_orders']} pending, {result['available_drivers']} available drivers.","tool_calls":[{"name":"get_operations_summary","arguments":{},"result":call_result}],"actions":[],"updated_orders":[]}
