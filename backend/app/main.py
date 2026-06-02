from decimal import Decimal

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.database import Base, engine, get_db
from app.models import Customer, Order, OrderItem, Product
from app.schemas import (
    CustomerCreate,
    CustomerRead,
    DashboardSummary,
    OrderCreate,
    OrderItemRead,
    OrderRead,
    ProductCreate,
    ProductRead,
    ProductUpdate,
)

settings = get_settings()

app = FastAPI(
    title="Inventory & Order Management API",
    version="1.0.0",
    description="Production-ready API for products, customers, orders, and inventory tracking.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str | list[str]]:
    return {
        "name": "Inventory & Order Management API",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
        "endpoints": ["/products", "/customers", "/orders", "/dashboard"],
    }


def serialize_order(order: Order) -> OrderRead:
    return OrderRead(
        id=order.id,
        customer_id=order.customer_id,
        customer_name=order.customer.full_name,
        customer_email=order.customer.email,
        total_amount=order.total_amount,
        created_at=order.created_at,
        items=[
            OrderItemRead(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product_name,
                product_sku=item.product_sku,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
            for item in order.items
        ],
    )


@app.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)) -> Product:
    product = Product(**payload.model_dump())
    db.add(product)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Product SKU already exists.") from exc
    db.refresh(product)
    return product


@app.get("/products", response_model=list[ProductRead])
def list_products(db: Session = Depends(get_db)) -> list[Product]:
    return list(db.scalars(select(Product).order_by(Product.name)))


@app.get("/products/{product_id}", response_model=ProductRead)
def get_product(product_id: int, db: Session = Depends(get_db)) -> Product:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")
    return product


@app.put("/products/{product_id}", response_model=ProductRead)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)) -> Product:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Product SKU already exists.") from exc
    db.refresh(product)
    return product


@app.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)) -> None:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")
    db.delete(product)
    db.commit()


@app.post("/customers", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)) -> Customer:
    customer = Customer(**payload.model_dump())
    db.add(customer)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Customer email already exists.") from exc
    db.refresh(customer)
    return customer


@app.get("/customers", response_model=list[CustomerRead])
def list_customers(db: Session = Depends(get_db)) -> list[Customer]:
    return list(db.scalars(select(Customer).order_by(Customer.full_name)))


@app.get("/customers/{customer_id}", response_model=CustomerRead)
def get_customer(customer_id: int, db: Session = Depends(get_db)) -> Customer:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found.")
    return customer


@app.delete("/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(customer_id: int, db: Session = Depends(get_db)) -> None:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found.")
    db.delete(customer)
    db.commit()


@app.post("/orders", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)) -> OrderRead:
    customer = db.get(Customer, payload.customer_id)
    if not customer:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found.")

    requested: dict[int, int] = {}
    for item in payload.items:
        requested[item.product_id] = requested.get(item.product_id, 0) + item.quantity

    products = list(db.scalars(select(Product).where(Product.id.in_(requested.keys())).with_for_update()))
    products_by_id = {product.id: product for product in products}
    missing_ids = set(requested) - set(products_by_id)
    if missing_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Product(s) not found: {sorted(missing_ids)}")

    for product_id, quantity in requested.items():
        product = products_by_id[product_id]
        if product.quantity_in_stock < quantity:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Insufficient inventory for {product.name}. Available: {product.quantity_in_stock}.",
            )

    total_amount = Decimal("0.00")
    order = Order(customer_id=customer.id, total_amount=total_amount)
    db.add(order)
    db.flush()

    for product_id, quantity in requested.items():
        product = products_by_id[product_id]
        unit_price = product.price
        line_total = unit_price * quantity
        total_amount += line_total
        product.quantity_in_stock -= quantity
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                product_name=product.name,
                product_sku=product.sku,
                quantity=quantity,
                unit_price=unit_price,
                line_total=line_total,
            )
        )

    order.total_amount = total_amount
    db.commit()

    saved = db.scalar(
        select(Order)
        .options(selectinload(Order.customer), selectinload(Order.items).selectinload(OrderItem.product))
        .where(Order.id == order.id)
    )
    if saved is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Order could not be loaded after creation.")
    return serialize_order(saved)


@app.get("/orders", response_model=list[OrderRead])
def list_orders(db: Session = Depends(get_db)) -> list[OrderRead]:
    orders = db.scalars(
        select(Order)
        .options(selectinload(Order.customer), selectinload(Order.items).selectinload(OrderItem.product))
        .order_by(Order.created_at.desc())
    )
    return [serialize_order(order) for order in orders]


@app.get("/orders/{order_id}", response_model=OrderRead)
def get_order(order_id: int, db: Session = Depends(get_db)) -> OrderRead:
    order = db.scalar(
        select(Order)
        .options(selectinload(Order.customer), selectinload(Order.items).selectinload(OrderItem.product))
        .where(Order.id == order_id)
    )
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    return serialize_order(order)


@app.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: int, db: Session = Depends(get_db)) -> None:
    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found.")
    db.delete(order)
    db.commit()


@app.get("/dashboard", response_model=DashboardSummary)
def dashboard(db: Session = Depends(get_db)) -> DashboardSummary:
    total_products = db.scalar(select(func.count(Product.id))) or 0
    total_customers = db.scalar(select(func.count(Customer.id))) or 0
    total_orders = db.scalar(select(func.count(Order.id))) or 0
    low_stock = list(
        db.scalars(
            select(Product)
            .where(Product.quantity_in_stock <= settings.low_stock_threshold)
            .order_by(Product.quantity_in_stock, Product.name)
        )
    )
    return DashboardSummary(
        total_products=total_products,
        total_customers=total_customers,
        total_orders=total_orders,
        low_stock_products=low_stock,
    )
