from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Order, Driver, DeliveryAssignment, AgentAction, DispatchRun

router=APIRouter(prefix="/operations",tags=["operations"])
@router.get("/summary")
def summary(db:Session=Depends(get_db)):
    today=date.today().isoformat(); orders=db.query(Order).filter_by(requested_date=today).all(); drivers=db.query(Driver).all()
    pending=sum(o.status in ("pending","delayed") for o in orders); urgent=sum(o.priority=="urgent" and o.status not in ("delivered","failed") for o in orders); assigned=sum(o.assigned_driver_id is not None for o in orders); late=db.query(Order).filter(Order.status.in_(["delayed","failed"])).count()
    last_run=db.query(DispatchRun).order_by(DispatchRun.created_at.desc(),DispatchRun.id.desc()).first()
    if last_run:
        manual,agent,saved=last_run.estimated_manual_minutes,last_run.estimated_agent_minutes,last_run.estimated_time_saved_minutes
    else:
        manual=pending*20
        capacity=sum(max(0,d.max_daily_deliveries-d.deliveries_today) for d in drivers if d.status=="available" and d.availability=="available")
        agent=5+max(0,pending-capacity)
        saved=max(0,manual-agent)
    return {"total_orders_today":len(orders),"pending_orders":pending,"urgent_orders":urgent,"available_drivers":sum(d.status=="available" and d.availability=="available" for d in drivers),"orders_assigned":assigned,"late_orders":late,"estimated_manual_minutes":manual,"estimated_agent_minutes":agent,"estimated_time_saved_minutes":saved,"estimated_time_saved_hours":round(saved/60,1),"driver_utilization":round(100*sum(min(d.deliveries_today,d.max_daily_deliveries) for d in drivers)/max(1,sum(d.max_daily_deliveries for d in drivers)))}
@router.get("/activity")
def activity(db:Session=Depends(get_db)):
    return [{"id":a.id,"action_type":a.action_type,"description":a.description,"entity_type":a.entity_type,"entity_id":a.entity_id,"created_at":a.created_at.isoformat()} for a in db.query(AgentAction).order_by(AgentAction.created_at.desc(),AgentAction.id.desc()).limit(80).all()]
@router.get("/assignments")
def assignments(db:Session=Depends(get_db)):
    rows=db.query(DeliveryAssignment).order_by(DeliveryAssignment.driver_id,DeliveryAssignment.sequence).all()
    return [{"id":a.id,"order_id":a.order_id,"driver_id":a.driver_id,"driver_name":a.driver.name,"vehicle_type":a.driver.vehicle_type,"current_zone":a.driver.current_zone,"zone":a.order.delivery_zone,"sequence":a.sequence,"estimated_minutes":a.estimated_minutes,"status":a.status} for a in rows]

@router.get("/latest-dispatch")
def latest_dispatch(db:Session=Depends(get_db)):
    run=db.query(DispatchRun).order_by(DispatchRun.created_at.desc(),DispatchRun.id.desc()).first()
    if not run: return None
    previous=db.query(DispatchRun).filter(DispatchRun.id<run.id).order_by(DispatchRun.id.desc()).first()
    window=[DeliveryAssignment.assigned_at<=run.created_at]
    if previous: window.append(DeliveryAssignment.assigned_at>previous.created_at)
    rows=db.query(DeliveryAssignment).join(DeliveryAssignment.order).filter(Order.requested_date==date.today().isoformat(),*window).order_by(DeliveryAssignment.driver_id,DeliveryAssignment.sequence).all()
    metrics={"orders_considered":run.orders_considered,"orders_assigned":run.orders_assigned,"drivers_used":run.drivers_used,"urgent_handled":run.urgent_handled,"estimated_manual_minutes":run.estimated_manual_minutes,"estimated_agent_minutes":run.estimated_agent_minutes,"estimated_time_saved_minutes":run.estimated_time_saved_minutes,"estimated_time_saved_hours":round(run.estimated_time_saved_minutes/60,1)}
    assignments=[{"id":a.id,"order_id":a.order_id,"driver_id":a.driver_id,"driver_name":a.driver.name,"zone":a.order.delivery_zone,"minutes":a.estimated_minutes,"priority":a.order.priority,"sequence":a.sequence,"status":a.status} for a in rows]
    action_query=db.query(AgentAction).filter(AgentAction.created_at<=run.created_at)
    if previous: action_query=action_query.filter(AgentAction.created_at>previous.created_at)
    actions=[a.description for a in action_query.filter(AgentAction.action_type.in_(["tool","assignment","dispatch"])).order_by(AgentAction.id.desc()).all()]
    return {"status":"completed","already_processed":False,"summary":f"Latest dispatch assigned {run.orders_assigned} of {run.orders_considered} orders across {run.drivers_used} drivers.","metrics":metrics,"assignments":assignments,"actions":actions,"dispatched_at":run.created_at.isoformat()}
