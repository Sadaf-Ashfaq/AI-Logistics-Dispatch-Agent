from datetime import datetime, timezone
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(30))
    pickup_zone: Mapped[str] = mapped_column(String(60), default="Downtown Cairo")
    delivery_zone: Mapped[str] = mapped_column(String(60))
    delivery_address: Mapped[str] = mapped_column(String(200))
    package_type: Mapped[str] = mapped_column(String(40), default="Parcel")
    package_weight: Mapped[float] = mapped_column(Float, default=1)
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    requested_date: Mapped[str] = mapped_column(String(10))
    promised_time: Mapped[str] = mapped_column(String(5), default="17:00")
    assigned_driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    estimated_delivery_time: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    driver: Mapped["Driver | None"] = relationship(foreign_keys=[assigned_driver_id])

class Driver(Base):
    __tablename__ = "drivers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(30))
    vehicle_type: Mapped[str] = mapped_column(String(30))
    vehicle_capacity: Mapped[float] = mapped_column(Float)
    current_zone: Mapped[str] = mapped_column(String(60))
    availability: Mapped[str] = mapped_column(String(20), default="available")
    max_daily_deliveries: Mapped[int] = mapped_column(Integer, default=8)
    deliveries_today: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="available")

class DeliveryAssignment(Base):
    __tablename__ = "assignments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    driver_id: Mapped[int] = mapped_column(ForeignKey("drivers.id"))
    sequence: Mapped[int] = mapped_column(Integer, default=1)
    estimated_minutes: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="assigned")
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    order: Mapped[Order] = relationship()
    driver: Mapped[Driver] = relationship()

class AgentAction(Base):
    __tablename__ = "agent_actions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    action_type: Mapped[str] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

class DispatchRun(Base):
    __tablename__ = "dispatch_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    orders_considered: Mapped[int] = mapped_column(Integer)
    orders_assigned: Mapped[int] = mapped_column(Integer)
    drivers_used: Mapped[int] = mapped_column(Integer)
    urgent_handled: Mapped[int] = mapped_column(Integer)
    estimated_manual_minutes: Mapped[int] = mapped_column(Integer)
    estimated_agent_minutes: Mapped[int] = mapped_column(Integer)
    estimated_time_saved_minutes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
