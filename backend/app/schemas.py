from datetime import date, time
from typing import Literal
from pydantic import BaseModel, Field, field_validator

class ChatRequest(BaseModel):
    message: str

class AssignRequest(BaseModel):
    driver_id: int

class StatusRequest(BaseModel):
    status: str

class CreateOrderRequest(BaseModel):
    customer_name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=3, max_length=30)
    pickup_zone: str = Field(min_length=1, max_length=60)
    delivery_zone: str = Field(min_length=1, max_length=60)
    delivery_address: str = Field(min_length=1, max_length=200)
    package_type: str = Field(min_length=1, max_length=40)
    package_weight: float = Field(gt=0, le=10000)
    priority: Literal["urgent", "high", "normal", "low"]
    requested_date: date
    promised_time: time

    @field_validator("customer_name", "phone", "pickup_zone", "delivery_zone", "delivery_address", "package_type")
    @classmethod
    def trim_required_text(cls, value):
        value=value.strip()
        if not value: raise ValueError("This field cannot be blank")
        return value

class CreateDriverRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=3, max_length=30)
    vehicle_type: str = Field(min_length=1, max_length=30)
    vehicle_capacity: float = Field(gt=0, le=100000)
    current_zone: str = Field(min_length=1, max_length=60)
    availability: Literal["available", "unavailable"] = "available"
    max_daily_deliveries: int = Field(ge=1, le=500)
    status: Literal["available", "busy", "offline"] = "available"

    @field_validator("name", "phone", "vehicle_type", "current_zone")
    @classmethod
    def trim_required_text(cls, value):
        value=value.strip()
        if not value: raise ValueError("This field cannot be blank")
        return value
