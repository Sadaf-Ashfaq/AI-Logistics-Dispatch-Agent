from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Order, Driver
from ..schemas import AssignRequest, StatusRequest, CreateOrderRequest
from ..services.dispatch_service import assign, log

router=APIRouter(prefix="/orders", tags=["orders"])
def view(o): return {"id":o.id,"customer_name":o.customer_name,"phone":o.phone,"pickup_zone":o.pickup_zone,"delivery_zone":o.delivery_zone,"delivery_address":o.delivery_address,"package_type":o.package_type,"package_weight":o.package_weight,"priority":o.priority,"status":o.status,"requested_date":o.requested_date,"promised_time":o.promised_time,"assigned_driver_id":o.assigned_driver_id,"driver_name":o.driver.name if o.driver else None,"estimated_delivery_time":o.estimated_delivery_time}
@router.get("")
def list_orders(db:Session=Depends(get_db)):
    return [view(o) for o in db.query(Order).order_by(Order.id).all()]
@router.post("")
def create_order(body:CreateOrderRequest,db:Session=Depends(get_db)):
    order=Order(customer_name=body.customer_name.strip(),phone=body.phone.strip(),pickup_zone=body.pickup_zone.strip(),delivery_zone=body.delivery_zone.strip(),delivery_address=body.delivery_address.strip(),package_type=body.package_type.strip(),package_weight=body.package_weight,priority=body.priority,status="pending",requested_date=body.requested_date.isoformat(),promised_time=body.promised_time.strftime("%H:%M"))
    db.add(order); db.flush(); log(db,"order_created",f"Created pending Order #{order.id} for {order.customer_name}","order",order.id); db.commit(); db.refresh(order); return view(order)
@router.post("/{order_id}/assign")
def assign_order(order_id:int, body:AssignRequest, db:Session=Depends(get_db)):
    o=db.get(Order,order_id); d=db.get(Driver,body.driver_id)
    if not o or not d: raise HTTPException(404,"Order or driver not found")
    result=assign(db,o,d,db.query(Order).filter_by(assigned_driver_id=d.id).count()+1); db.commit(); return result
@router.post("/{order_id}/status")
def update_status(order_id:int,body:StatusRequest,db:Session=Depends(get_db)):
    if body.status not in {"pending","assigned","in_transit","delivered","delayed","failed"}: raise HTTPException(400,"Invalid status")
    o=db.get(Order,order_id)
    if not o: raise HTTPException(404,"Order not found")
    o.status=body.status; log(db,"status",f"Order #{o.id} status changed to {body.status}","order",o.id); db.commit(); return view(o)
