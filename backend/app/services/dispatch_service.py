from datetime import date
from sqlalchemy.orm import Session
from ..models import Order, Driver, DeliveryAssignment, AgentAction, DispatchRun
from .route_service import estimate_route

def log(db: Session, action_type: str, description: str, entity_type="system", entity_id=None):
    db.add(AgentAction(action_type=action_type, description=description, entity_type=entity_type, entity_id=entity_id))

def assign(db: Session, order: Order, driver: Driver, sequence: int):
    minutes = estimate_route(driver.current_zone, order.delivery_zone)
    order.assigned_driver_id, order.status, order.estimated_delivery_time = driver.id, "assigned", minutes
    driver.deliveries_today += 1
    if driver.deliveries_today >= driver.max_daily_deliveries: driver.status = "busy"
    db.add(DeliveryAssignment(order_id=order.id, driver_id=driver.id, sequence=sequence, estimated_minutes=minutes))
    log(db, "assignment", f"Assigned Order #{order.id} ({order.priority}) to {driver.name}; {order.delivery_zone} estimated {minutes} min.", "order", order.id)
    return {"order_id": order.id, "driver_id": driver.id, "driver_name": driver.name, "zone": order.delivery_zone, "minutes": minutes, "priority": order.priority}

def run_dispatch(db: Session):
    orders = db.query(Order).filter(Order.requested_date == date.today().isoformat(), Order.status.in_(["pending", "delayed"]), Order.assigned_driver_id.is_(None)).all()
    if not orders:
        previous = db.query(DispatchRun).order_by(DispatchRun.created_at.desc(), DispatchRun.id.desc()).first()
        if previous and previous.created_at.date() == date.today() and previous.orders_considered > 0:
            metrics = {"orders_considered": previous.orders_considered, "orders_assigned": previous.orders_assigned, "drivers_used": previous.drivers_used, "urgent_handled": previous.urgent_handled, "estimated_manual_minutes": previous.estimated_manual_minutes, "estimated_agent_minutes": previous.estimated_agent_minutes, "estimated_time_saved_minutes": previous.estimated_time_saved_minutes, "estimated_time_saved_hours": round(previous.estimated_time_saved_minutes / 60, 1)}
            prior = db.query(DispatchRun).filter(DispatchRun.id < previous.id).order_by(DispatchRun.id.desc()).first()
            assignment_query = db.query(DeliveryAssignment).join(DeliveryAssignment.order).filter(Order.requested_date == date.today().isoformat(), DeliveryAssignment.assigned_at <= previous.created_at)
            if prior: assignment_query = assignment_query.filter(DeliveryAssignment.assigned_at > prior.created_at)
            assignments = [{"id": a.id, "order_id": a.order_id, "driver_id": a.driver_id, "driver_name": a.driver.name, "zone": a.order.delivery_zone, "minutes": a.estimated_minutes, "priority": a.order.priority, "sequence": a.sequence, "status": a.status} for a in assignment_query.order_by(DeliveryAssignment.driver_id, DeliveryAssignment.sequence).all()]
            action_query = db.query(AgentAction).filter(AgentAction.action_type.in_(["tool", "assignment", "dispatch"]), AgentAction.created_at <= previous.created_at)
            if prior: action_query = action_query.filter(AgentAction.created_at > prior.created_at)
            actions = [a.description for a in action_query.order_by(AgentAction.id.desc()).all()]
            return {"status": "already_up_to_date", "already_processed": True, "summary": f"Today's dispatch is already up to date. {previous.orders_assigned} orders were previously assigned; there are no new dispatchable orders.", "metrics": metrics, "assignments": assignments, "actions": actions, "dispatched_at": previous.created_at.isoformat()}
        metrics = {"orders_considered": 0, "orders_assigned": 0, "drivers_used": 0, "urgent_handled": 0, "estimated_manual_minutes": 0, "estimated_agent_minutes": 0, "estimated_time_saved_minutes": 0, "estimated_time_saved_hours": 0}
        return {"status": "no_work", "already_processed": False, "summary": "No dispatchable orders are currently available.", "metrics": metrics, "assignments": [], "actions": [], "dispatched_at": None}
    drivers = db.query(Driver).filter(Driver.status == "available", Driver.availability == "available").all()
    log(db, "tool", f"Retrieved {len(orders)} dispatchable orders", "system")
    log(db, "tool", f"Checked {db.query(Driver).count()} drivers; {len(drivers)} available", "system")
    orders.sort(key=lambda o: ({"urgent": 0, "high": 1, "normal": 2, "low": 3}.get(o.priority, 2), o.promised_time))
    assignments = []
    # Greedy: prioritize urgency, keep each driver's zone coherent, then balance capacity.
    for order in orders:
        eligible = [d for d in drivers if d.status == "available" and d.deliveries_today < d.max_daily_deliveries and d.vehicle_capacity >= order.package_weight]
        if not eligible: continue
        driver = min(eligible, key=lambda d: (d.deliveries_today / max(d.max_daily_deliveries, 1), estimate_route(d.current_zone, order.delivery_zone)))
        sequence = db.query(DeliveryAssignment).filter_by(driver_id=driver.id).count() + 1
        assignments.append(assign(db, order, driver, sequence))
        driver.current_zone = order.delivery_zone
    db.commit()
    total = len(orders)
    manual = total * 20
    automated = 5 + max(0, total-len(assignments))
    metrics = {"orders_considered": total, "orders_assigned": len(assignments), "drivers_used": len({a["driver_id"] for a in assignments}), "urgent_handled": sum(1 for a in assignments if a["priority"] == "urgent"), "estimated_manual_minutes": manual, "estimated_agent_minutes": automated, "estimated_time_saved_minutes": max(0, manual-automated), "estimated_time_saved_hours": round(max(0, manual-automated)/60, 1)}
    db.add(DispatchRun(orders_considered=total, orders_assigned=metrics["orders_assigned"], drivers_used=metrics["drivers_used"], urgent_handled=metrics["urgent_handled"], estimated_manual_minutes=manual, estimated_agent_minutes=automated, estimated_time_saved_minutes=metrics["estimated_time_saved_minutes"]))
    log(db, "dispatch", f"Dispatch plan completed: {len(assignments)} assignments, {metrics['estimated_time_saved_minutes']} dispatcher minutes saved", "system")
    db.commit()
    latest = db.query(DispatchRun).order_by(DispatchRun.created_at.desc(), DispatchRun.id.desc()).first()
    return {"status": "completed", "already_processed": False, "summary": f"Assigned {len(assignments)} of {total} dispatchable orders across {metrics['drivers_used']} drivers.", "assignments": assignments, "metrics": metrics, "actions": [a.description for a in db.query(AgentAction).order_by(AgentAction.id.desc()).limit(len(assignments)+3).all()], "dispatched_at": latest.created_at.isoformat() if latest else None}
