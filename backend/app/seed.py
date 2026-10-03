from datetime import date, timedelta
import argparse
from pathlib import Path
import shutil
from .database import Base, engine, SessionLocal
from .models import Order, Driver, DeliveryAssignment
from .services.dispatch_service import log
from .services.route_service import estimate_route

NAMES = ["Ahmed Hassan", "Omar Khaled", "Mahmoud Ali", "Youssef Samir", "Karim Nabil", "Mostafa Adel", "Amr Fathy", "Tarek Ibrahim"]
ZONES = ["Downtown Cairo", "Nasr City", "New Cairo", "Heliopolis", "Maadi", "Giza", "Dokki", "6th of October", "Zamalek", "Mokattam"]
CUSTOMERS = ["Mona El-Sayed", "Hany Farouk", "Salma Nasser", "Khaled Amin", "Dina Magdy", "Rania Mostafa", "Fady Naguib", "Nour Hassan", "Layla Adel", "Sherif Taha", "Ola Ibrahim", "Hossam Saeed", "Farah Younis", "Tamer Ashraf", "Mai Kamal", "Adel Mansour", "Nada Fawzy", "Bassem Reda", "Yara Emad", "Wael Sobhi"]

def seed(reset=False):
    if reset:
        database_path=engine.url.database
        if database_path and database_path not in (":memory:", ""):
            source=Path(database_path)
            if not source.is_absolute(): source=Path.cwd()/source
            if source.exists(): shutil.copy2(source,source.with_suffix(source.suffix+".bak"))
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        if db.query(Order).count() or db.query(Driver).count(): return
        today = date.today()
        drivers = []
        for i, name in enumerate(NAMES):
            d = Driver(name=name, phone=f"+20 10{i+1} 555 {1000+i}", vehicle_type="Motorcycle" if i < 5 else "Van", vehicle_capacity=12 if i < 5 else 120, current_zone=ZONES[i], availability="unavailable" if i == 7 else "available", max_daily_deliveries=8 if i < 5 else 12, deliveries_today=(2 if i in (0,2,4) else 0), status="offline" if i == 7 else ("busy" if i == 6 else "available"))
            db.add(d); drivers.append(d)
        db.flush()
        statuses = ["pending"]*12 + ["assigned"]*4 + ["in_transit","delivered","delayed","failed"]
        priorities = ["urgent","high","normal","normal","urgent","low","normal","high","normal","normal","urgent","normal","low","high","normal","high","normal","low","normal","urgent"]
        for i in range(20):
            old = i == 18
            o = Order(customer_name=CUSTOMERS[i], phone=f"+20 12 3456 {1000+i}", pickup_zone="Downtown Cairo", delivery_zone=ZONES[(i*3+1)%10], delivery_address=f"{10+i} {ZONES[(i*3+1)%10]} Main Street", package_type=["Parcel","Documents","Electronics"][i%3], package_weight=[1.2,2.4,0.5,4.0][i%4], priority=priorities[i], status=statuses[i], requested_date=(today-timedelta(days=1) if old else today).isoformat(), promised_time=f"{14+i%5:02d}:00", assigned_driver_id=(drivers[i%6].id if statuses[i] in ["assigned","in_transit","delivered"] else None), estimated_delivery_time=35 if statuses[i] in ["assigned","in_transit"] else None)
            db.add(o)
            if statuses[i] in ("assigned", "in_transit"):
                db.flush()
                driver=drivers[i%6]
                sequence=db.query(DeliveryAssignment).filter_by(driver_id=driver.id).count()+1
                db.add(DeliveryAssignment(order_id=o.id,driver_id=driver.id,sequence=sequence,estimated_minutes=estimate_route(driver.current_zone,o.delivery_zone),status=statuses[i]))
                log(db,"assignment",f"Seeded existing {statuses[i]} assignment for Order #{o.id} to {driver.name}","order",o.id)
        db.commit()
        log(db, "system", "Demo data initialized: 20 orders and 8 drivers")
        db.commit()
    finally: db.close()

if __name__ == "__main__":
    parser=argparse.ArgumentParser(description="Initialize RouteFlow demo data")
    parser.add_argument("--reset",action="store_true",help="drop and recreate the local demo database")
    seed(reset=parser.parse_args().reset)
