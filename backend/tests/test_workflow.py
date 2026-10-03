import unittest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.database import Base
from app.models import Order, Driver, DeliveryAssignment
from app.services.route_service import estimate_route
from app.services.dispatch_service import assign, run_dispatch
from app.seed import seed

class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.engine=create_engine("sqlite://",connect_args={"check_same_thread":False},poolclass=StaticPool)
        Base.metadata.create_all(self.engine); self.Session=sessionmaker(bind=self.engine); self.db=self.Session()
        self.d=Driver(name="Ahmed Test",phone="010",vehicle_type="Van",vehicle_capacity=50,current_zone="Downtown Cairo",availability="available",max_daily_deliveries=4,deliveries_today=0,status="available")
        self.db.add(self.d); self.db.flush()
        self.o=Order(customer_name="Demo Customer",phone="012",pickup_zone="Downtown Cairo",delivery_zone="Nasr City",delivery_address="Nasr City",package_type="Parcel",package_weight=1,priority="urgent",status="pending",requested_date=date.today().isoformat(),promised_time="15:00")
        self.db.add(self.o); self.db.commit()
    def tearDown(self): self.db.close(); self.engine.dispose()
    def test_database_and_retrieval(self):
        self.assertEqual(self.db.query(Order).count(),1); self.assertEqual(self.db.query(Driver).count(),1)
    def test_route_estimation(self): self.assertEqual(estimate_route("Downtown Cairo","Nasr City"),30)
    def test_assignment_persists(self):
        result=assign(self.db,self.o,self.d,1); self.db.commit()
        self.assertEqual(self.o.status,"assigned"); self.assertEqual(result["minutes"],30); self.assertEqual(self.db.query(DeliveryAssignment).count(),1)
    def test_dispatch_workflow(self):
        result=run_dispatch(self.db)
        self.assertEqual(result["metrics"]["orders_assigned"],1); self.assertEqual(self.db.query(DeliveryAssignment).count(),1)
    def test_repeat_dispatch_returns_saved_plan_without_duplicate_assignment(self):
        first=run_dispatch(self.db); second=run_dispatch(self.db)
        self.assertEqual(first["status"],"completed")
        self.assertEqual(second["status"],"already_up_to_date")
        self.assertEqual(second["metrics"]["orders_assigned"],1)
        self.assertEqual(len(second["assignments"]),1)
        self.assertEqual(self.db.query(DeliveryAssignment).count(),1)
    def test_empty_queue_without_prior_dispatch_is_no_work(self):
        self.o.status="assigned"; self.o.assigned_driver_id=self.d.id; self.db.commit()
        result=run_dispatch(self.db)
        self.assertEqual(result["status"],"no_work")
        self.assertEqual(result["metrics"]["orders_assigned"],0)
        self.assertEqual(self.db.query(DeliveryAssignment).count(),0)

if __name__ == "__main__": unittest.main()
