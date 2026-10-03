from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Driver, DeliveryAssignment
from ..schemas import CreateDriverRequest
from ..services.dispatch_service import log

router=APIRouter(prefix="/drivers",tags=["drivers"])
@router.get("")
def list_drivers(db:Session=Depends(get_db)):
    return [{"id":d.id,"name":d.name,"phone":d.phone,"vehicle_type":d.vehicle_type,"vehicle_capacity":d.vehicle_capacity,"current_zone":d.current_zone,"availability":d.availability,"max_daily_deliveries":d.max_daily_deliveries,"deliveries_today":d.deliveries_today,"status":d.status} for d in db.query(Driver).order_by(Driver.id).all()]
@router.post("")
def create_driver(body:CreateDriverRequest,db:Session=Depends(get_db)):
    driver=Driver(name=body.name.strip(),phone=body.phone.strip(),vehicle_type=body.vehicle_type.strip(),vehicle_capacity=body.vehicle_capacity,current_zone=body.current_zone.strip(),availability=body.availability,max_daily_deliveries=body.max_daily_deliveries,deliveries_today=0,status=body.status)
    db.add(driver); db.flush(); log(db,"driver_created",f"Added driver {driver.name} ({driver.vehicle_type})","driver",driver.id); db.commit(); db.refresh(driver)
    return {"id":driver.id,"name":driver.name,"phone":driver.phone,"vehicle_type":driver.vehicle_type,"vehicle_capacity":driver.vehicle_capacity,"current_zone":driver.current_zone,"availability":driver.availability,"max_daily_deliveries":driver.max_daily_deliveries,"deliveries_today":driver.deliveries_today,"status":driver.status}
@router.get("/{driver_id}")
def driver_details(driver_id:int,db:Session=Depends(get_db)):
    d=db.get(Driver,driver_id)
    if not d: raise HTTPException(404,"Driver not found")
    return {"id":d.id,"name":d.name,"vehicle_type":d.vehicle_type,"zone":d.current_zone,"capacity_remaining":max(0,d.max_daily_deliveries-d.deliveries_today)}
